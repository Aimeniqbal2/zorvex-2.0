import { create } from 'zustand';
import type { AuthState, AuthUser } from './authTypes';
import { TokenManager } from './tokenManager';

function parseJwt(token: string): AuthUser | null {
    try {
        const base64Url = token.split('.')[1];
        if (!base64Url) return null;
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            window.atob(base64).split('').map(function (c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join('')
        );
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error('Failed to parse JWT:', e);
        return null;
    }
}

export const useAuthStore = create<AuthState>((set) => ({
    isAuthenticated: false,
    accessToken: null,
    user: null,
    loading: true,

    setAuth: (token: string) => {
        const user = parseJwt(token);
        set({
            isAuthenticated: true,
            accessToken: token,
            user,
            loading: false
        });
    },

    clearAuth: () => {
        TokenManager.clearTokens();
        set({
            isAuthenticated: false,
            accessToken: null,
            user: null,
            loading: false
        });
    },

    initialize: () => {
        const token = TokenManager.getAccessToken();
        if (token) {
            const user = parseJwt(token);
            // Optionally check token expiration here
            set({
                isAuthenticated: true,
                accessToken: token,
                user,
                loading: false
            });
        } else {
            set({
                isAuthenticated: false,
                accessToken: null,
                user: null,
                loading: false
            });
        }
    }
}));
