import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '../api/client';

export interface IndustryCapability {
    code: string;
    label: string;
    engine: string;
    enabled: boolean;
}

export interface AppState {
    theme: 'light' | 'dark';
    enabledModules: Record<string, boolean>; // Effective engines (user)
    companyModules: string[];
    userModules: string[];
    loadingModules: boolean;
    industry: any;
    pkg: any;
    capabilities: IndustryCapability[];
    setTheme: (theme: 'light' | 'dark') => void;
    toggleTheme: () => void;
    fetchModuleState: () => Promise<void>;
}

export const useAppStore = create<AppState>()(
    persist(
        (set, get) => {
            // Initialize theme from localStorage if not handled by persist yet (fallback)
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
                companyModules: [],
                userModules: [],
                loadingModules: false, // Default to false so we don't block if cached
                industry: null,
                pkg: null,
                capabilities: [],

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
                    const currentModules = get().enabledModules;
                    const hasData = Object.keys(currentModules).length > 0;
                    
                    if (!hasData) {
                        set({ loadingModules: true });
                    }
                    
                    try {
                        const response = await apiClient.get('/api/platform/runtime-config/');
                        const data = response.data;
                        set({ 
                            enabledModules: data.engines || {}, 
                            companyModules: data.company_modules || [],
                            userModules: data.user_modules || [],
                            industry: data.industry || null,
                            pkg: data.package || null,
                            capabilities: data.capabilities || [],
                            loadingModules: false 
                        });
                    } catch (error) {
                        console.error('Failed to fetch module state', error);
                        set({ loadingModules: false });
                    }
                }
            };
        },
        {
            name: 'erp-app-storage',
            partialize: (state) => ({ 
                enabledModules: state.enabledModules,
                companyModules: state.companyModules,
                userModules: state.userModules,
                industry: state.industry,
                pkg: state.pkg,
                capabilities: state.capabilities
            }),
        }
    )
);
