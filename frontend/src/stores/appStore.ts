import { create } from 'zustand';
import { apiClient } from '../api/client';

export interface AppState {
    theme: 'light' | 'dark';
    enabledModules: Record<string, boolean>;
    loadingModules: boolean;
    setTheme: (theme: 'light' | 'dark') => void;
    toggleTheme: () => void;
    fetchModuleState: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => {
    // Initialize theme from localStorage
    const savedTheme = localStorage.getItem('erp_theme') as 'light' | 'dark' | null;
    const initialTheme = savedTheme || 'light';
    
    // Apply theme to document element
    if (initialTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }

    return {
        theme: initialTheme,
        enabledModules: {},
        loadingModules: true,

        setTheme: (theme) => {
            localStorage.setItem('erp_theme', theme);
            if (theme === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                document.documentElement.removeAttribute('data-theme');
            }
            set({ theme });
        },

        toggleTheme: () => {
            const newTheme = get().theme === 'light' ? 'dark' : 'light';
            get().setTheme(newTheme);
        },

        fetchModuleState: async () => {
            set({ loadingModules: true });
            try {
                const response = await apiClient.get('/api/platform/module-state/');
                set({ enabledModules: response.data || {}, loadingModules: false });
            } catch (error) {
                console.error('Failed to fetch module state', error);
                set({ enabledModules: {}, loadingModules: false });
            }
        }
    };
});
