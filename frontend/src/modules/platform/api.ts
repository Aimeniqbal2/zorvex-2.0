import { apiClient as api } from '../../api/client';
import type { IndustryTemplate, ProvisioningPayload, ProvisioningResponse } from './types';

export const getIndustryTemplate = async (businessType: string): Promise<IndustryTemplate> => {
    const res = await api.get(`/api/platform/industry-template/?business_type=${businessType}`);
    return res.data;
};

export const provisionCompany = async (payload: ProvisioningPayload): Promise<ProvisioningResponse> => {
    const res = await api.post('/api/platform/companies/provision/', payload);
    return res.data;
};
