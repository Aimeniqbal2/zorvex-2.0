import { apiClient } from '../../api/client';
import type { PaginatedResponse } from '../inventory/types';
import type { 
    Customer, 
    POSSession, 
    CheckoutPayload, 
    CheckoutResponse 
} from './types';

const BASE_URL = '/api/sales';

// ==========================================
// POS Session API
// ==========================================

export const getActiveSession = async (): Promise<POSSession | null> => {
    // Usually backend should return active session for current user, but let's just get the list and find OPEN
    // To match actual backend, POSSessionViewSet is a ModelViewSet.
    const response = await apiClient.get(`${BASE_URL}/sessions/`, {
        params: { status: 'OPEN' }
    });
    
    // Auto-unwrap paginated responses
    if (response.data && typeof response.data.count === 'number' && Array.isArray(response.data.results)) {
        return response.data.results.length > 0 ? response.data.results[0] : null;
    }
    
    // Handle unpaginated array response
    if (Array.isArray(response.data)) {
        return response.data.length > 0 ? response.data[0] : null;
    }
    
    return null;
};

export const openSession = async (opening_cash: string): Promise<POSSession> => {
    const response = await apiClient.post(`${BASE_URL}/sessions/`, {
        opening_cash,
        status: 'OPEN'
    });
    return response.data;
};

export const closeSession = async (id: string, closing_cash: string): Promise<POSSession> => {
    const response = await apiClient.patch(`${BASE_URL}/sessions/${id}/`, {
        closing_cash,
        status: 'CLOSED'
    });
    return response.data;
};

// ==========================================
// Customer API
// ==========================================

export const getCustomers = async (params?: { search?: string; limit?: number }): Promise<PaginatedResponse<Customer>> => {
    const response = await apiClient.get(`${BASE_URL}/customers/`, { params });
    if (Array.isArray(response.data)) {
        return {
            count: response.data.length,
            next: null,
            previous: null,
            results: response.data
        };
    }
    return response.data;
};

// ==========================================
// Checkout API
// ==========================================

export const checkoutSale = async (payload: CheckoutPayload): Promise<CheckoutResponse> => {
    const response = await apiClient.post(`${BASE_URL}/sales/checkout/`, payload);
    return response.data;
};
