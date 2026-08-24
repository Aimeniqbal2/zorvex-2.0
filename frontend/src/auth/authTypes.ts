export interface AuthUser {
    user_id?: string | number;
    username?: string;
    role?: string;
    company_id?: string;
    exp?: number;
    iat?: number;
    permissions?: string[];
    capabilities?: string[];
}

export interface AuthState {
    isAuthenticated: boolean;
    accessToken: string | null;
    user: AuthUser | null;
    loading: boolean;
    setAuth: (token: string) => void;
    clearAuth: () => void;
    initialize: () => void;
}
