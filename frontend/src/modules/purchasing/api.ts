import { apiClient } from '../../api/client';
import type { ProcurementDocument, ProcurementLine } from './types';

export const purchasingApi = {
    getDocuments: async (params?: Record<string, any>) => {
        const response = await apiClient.get('/api/purchasing/documents/', { params });
        return response.data;
    },
    getDocument: async (id: number) => {
        const response = await apiClient.get(`/api/purchasing/documents/${id}/`);
        return response.data;
    },
    createDocument: async (data: Partial<ProcurementDocument>) => {
        const response = await apiClient.post('/api/purchasing/documents/', data);
        return response.data;
    },
    updateDocument: async (id: number, data: Partial<ProcurementDocument>) => {
        const response = await apiClient.patch(`/api/purchasing/documents/${id}/`, data);
        return response.data;
    },
    postAction: async (id: number, action: string, data: any = {}) => {
        const response = await apiClient.post(`/api/purchasing/documents/${id}/${action}/`, data);
        return response.data;
    },
    getPendingApprovals: async (params?: Record<string, any>) => {
        const response = await apiClient.get('/api/purchasing/documents/pending_approvals/', { params });
        return response.data;
    },

    
    getLines: async (params?: Record<string, any>) => {
        const response = await apiClient.get('/api/purchasing/lines/', { params });
        return response.data;
    },
    createLine: async (data: Partial<ProcurementLine>) => {
        const response = await apiClient.post('/api/purchasing/lines/', data);
        return response.data;
    },
    updateLine: async (id: number, data: Partial<ProcurementLine>) => {
        const response = await apiClient.patch(`/api/purchasing/lines/${id}/`, data);
        return response.data;
    },
    deleteLine: async (id: number) => {
        const response = await apiClient.delete(`/api/purchasing/lines/${id}/`);
        return response.data;
    },

    getTags: async () => {
        const response = await apiClient.get('/api/purchasing/tags/');
        return response.data;
    },
    getApprovalWorkflows: async (params?: Record<string, any>) => {
        const response = await apiClient.get('/api/purchasing/workflows/', { params });
        return response.data;
    },
    getApprovalHistory: async (params?: Record<string, any>) => {
        const response = await apiClient.get('/api/purchasing/approval-history/', { params });
        return response.data;
    },
    getItems: async () => {
        const response = await apiClient.get('/api/inventory/items/');
        return response.data;
    },
    getWarehouses: async () => {
        const response = await apiClient.get('/api/platform/warehouses/');
        return response.data;
    },
    getSuppliers: async () => {
        const response = await apiClient.get('/api/crm/entities/?type=SUPPLIER');
        return response.data;
    }
};
