export interface IndustryTemplate {
    recommended_modules: string[];
    required_modules: string[];
    optional_modules: string[];
    default_roles?: string[];
}

export interface ProvisioningPayload {
    name: string;
    business_type: string;
    domain?: string;
    phone?: string;
    address?: string;
    admin_username: string;
    admin_email: string;
    admin_password: string;
    selected_modules: string[];
}

export interface ProvisioningResponse {
    status: string;
    company_id: string;
    company_name: string;
    admin_id: string;
    error?: string;
}
