export const TokenManager = {
    getAccessToken: (): string | null => localStorage.getItem('access_token'),
    getRefreshToken: (): string | null => localStorage.getItem('refresh_token'),
    
    setTokens: (access: string, refresh: string) => {
        localStorage.setItem('access_token', access);
        localStorage.setItem('refresh_token', refresh);
    },

    setAccessToken: (access: string) => {
        localStorage.setItem('access_token', access);
    },
    
    clearTokens: () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
    },
    
    hasValidSession: (): boolean => {
        return !!localStorage.getItem('access_token');
    }
};
