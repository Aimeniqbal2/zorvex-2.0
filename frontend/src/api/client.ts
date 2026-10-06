import axios, { AxiosError } from 'axios';
import { TokenManager } from '../auth/tokenManager';
import { useAuthStore } from '../auth/authStore';

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
    // For FormData uploads, remove explicit Content-Type so browser sets multipart boundary
    if (config.data instanceof FormData && config.headers) {
        delete config.headers['Content-Type'];
    }

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

// Mutex lock and promise queue for token refreshing
let isRefreshing = false;
let failedQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else if (token) {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

// Response interceptor: handle HTML responses, 401s, and mutex-protected token refresh
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
        const originalRequest = error.config as any;
        
        // If error is 401 and we haven't already retried this request
        if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
            const refreshToken = TokenManager.getRefreshToken();
            
            // If no refresh token exists, clear auth and redirect to login
            if (!refreshToken) {
                TokenManager.clearTokens();
                useAuthStore.getState().clearAuth();
                if (typeof window !== 'undefined') {
                    window.location.href = '/app/login';
                }
                return Promise.reject(error);
            }

            // If a refresh is already in progress, queue this request
            if (isRefreshing) {
                return new Promise<string>((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                })
                    .then((token) => {
                        if (originalRequest.headers) {
                            originalRequest.headers.Authorization = `Bearer ${token}`;
                        }
                        return apiClient(originalRequest);
                    })
                    .catch((err) => {
                        return Promise.reject(err);
                    });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                // Try to refresh token using un-intercepted raw axios
                const response = await axios.post(`${apiClient.defaults.baseURL}/api/auth/refresh/`, {
                    refresh: refreshToken
                });
                
                const newAccessToken = response.data?.access;
                if (newAccessToken) {
                    TokenManager.setAccessToken(newAccessToken);
                    useAuthStore.getState().setAuth(newAccessToken);
                    
                    if (originalRequest.headers) {
                        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                    }
                    processQueue(null, newAccessToken);
                    return apiClient(originalRequest);
                } else {
                    throw new Error('Refresh response missing access token');
                }
            } catch (refreshError) {
                processQueue(refreshError, null);
                // Refresh failed, clear tokens and auth state, then redirect
                TokenManager.clearTokens();
                useAuthStore.getState().clearAuth();
                if (typeof window !== 'undefined') {
                    window.location.href = '/app/login';
                }
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }
        
        return Promise.reject(error);
    }
);
