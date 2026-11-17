import { apiClient } from './client';

export interface UserEmailSignature {
    id: string;
    user: string;
    user_name: string;
    name: string;
    signature_type: 'TEXT' | 'IMAGE';
    text_content: string;
    image?: string | null;
    image_url?: string | null;
    is_default: boolean;
    created_at: string;
    updated_at: string;
}

export const getMySignatures = async (): Promise<UserEmailSignature[]> => {
    const res = await apiClient.get('/api/communications/signatures/my_signatures/');
    return res.data;
};

export const getSignatures = async (): Promise<UserEmailSignature[]> => {
    const res = await apiClient.get('/api/communications/signatures/');
    return res.data.results || res.data;
};

export const createSignature = async (data: FormData | Partial<UserEmailSignature>): Promise<UserEmailSignature> => {
    const isFormData = data instanceof FormData;
    const res = await apiClient.post('/api/communications/signatures/', data, {
        headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : undefined
    });
    return res.data;
};

export const updateSignature = async (id: string, data: FormData | Partial<UserEmailSignature>): Promise<UserEmailSignature> => {
    const isFormData = data instanceof FormData;
    const res = await apiClient.patch(`/api/communications/signatures/${id}/`, data, {
        headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : undefined
    });
    return res.data;
};

export const deleteSignature = async (id: string): Promise<void> => {
    await apiClient.delete(`/api/communications/signatures/${id}/`);
};

export interface SenderIdentity {
    id: string;
    name: string;
    email_address: string;
    reply_to?: string | null;
    provider_type: 'SMTP' | 'SYSTEM_DEFAULT';
    verification_status: 'USABLE' | 'UNVERIFIED' | 'VERIFIED' | 'DISABLED';
    is_active: boolean;
    is_default: boolean;
    is_usable: boolean;
    smtp_host?: string | null;
    smtp_port?: number | null;
    smtp_username?: string | null;
    smtp_password?: string | null;
    smtp_use_tls: boolean;
    has_smtp_password?: boolean;
    created_at: string;
    updated_at: string;
}

export const getSenderIdentities = async (): Promise<SenderIdentity[]> => {
    const res = await apiClient.get('/api/communications/senders/');
    return res.data.results || res.data;
};

export const createSenderIdentity = async (data: Partial<SenderIdentity>): Promise<SenderIdentity> => {
    const res = await apiClient.post('/api/communications/senders/', data);
    return res.data;
};

export const updateSenderIdentity = async (id: string, data: Partial<SenderIdentity>): Promise<SenderIdentity> => {
    const res = await apiClient.patch(`/api/communications/senders/${id}/`, data);
    return res.data;
};

export const deleteSenderIdentity = async (id: string): Promise<void> => {
    await apiClient.delete(`/api/communications/senders/${id}/`);
};

export const testSenderConnection = async (id: string): Promise<{ status: string; verification_status: string; message: string }> => {
    const res = await apiClient.post(`/api/communications/senders/${id}/test_connection/`);
    return res.data;
};
