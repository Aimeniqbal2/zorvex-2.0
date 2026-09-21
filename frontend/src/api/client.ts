import axios, { AxiosError } from 'axios';
import { TokenManager } from '../auth/tokenManager';

export const getApiBaseUrl = (): string => {
    if (import.meta.env.VITE_API_BASE_URL) {
        return import.meta.env.VITE_API_BASE_URL;
    }
    if (typeof window !== 'undefined') {
        // In browser (both Vite dev proxy and Production Nginx proxy), use same-origin relative URLs
        return '';
    }
    return 'http://127.0.0.1:8000';
};

export const API_HOST_URL = (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8000');

export const apiClient = axios.create({
    baseURL: getApiBaseUrl(),
    headers: {
        'Content-Type': 'application/json'
    }
});

// Request interceptor: attach token and company context
apiClient.interceptors.request.use((config) => {
    const token = TokenManager.getAccessToken();
    if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    if (typeof window !== 'undefined') {
        const companyId = localStorage.getItem('current_company_id');
        if (companyId && config.headers && !config.headers['X-Company-ID']) {
            config.headers['X-Company-ID'] = companyId;
        }
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

// Response interceptor: handle HTML responses, 401s, and refresh tokens
apiClient.interceptors.response.use(
    (response) => {
        // Prevent silent acceptance of HTML from legacy routes
        const contentType = response.headers['content-type'] || '';
        if (String(contentType).includes('text/html')) {
            console.error('API Error: Received HTML response instead of JSON at', response.config.url);
            return Promise.reject(new Error(`API Error: Received HTML instead of JSON from ${response.config.url}. Check backend route.`));
        }
        return response;
    },
    async (error: AxiosError) => {
        const originalRequest = error.config;
        
        // If error is 401 and we haven't already retried
        if (error.response?.status === 401 && originalRequest && !(originalRequest as any)._retry) {
            (originalRequest as any)._retry = true;
            
            const refreshToken = TokenManager.getRefreshToken();
            if (refreshToken) {
                try {
                    // Try to refresh token
                    const response = await axios.post(`${apiClient.defaults.baseURL}/api/auth/refresh/`, {
                        refresh: refreshToken
                    });
                    
                    const newAccessToken = response.data.access;
                    if (newAccessToken) {
                        TokenManager.setAccessToken(newAccessToken);
                        
                        // Update the failed request with new token and retry
                        if (originalRequest.headers) {
                            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                        }
                        return apiClient(originalRequest);
                    }
                } catch (refreshError) {
                    // Refresh failed, clear tokens and redirect
                    TokenManager.clearTokens();
                    window.location.href = '/app/login';
                    return Promise.reject(refreshError);
                }
            } else {
                // No refresh token available
                TokenManager.clearTokens();
                window.location.href = '/app/login';
            }
        }
        
        return Promise.reject(error);
    }
);
