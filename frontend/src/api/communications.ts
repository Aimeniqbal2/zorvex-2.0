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
