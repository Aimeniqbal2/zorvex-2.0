import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '../api/client';
import { useWorkspaceStore } from './workspaceStore';

export interface IndustryCapability {
    code: string;
    label: string;
    engine: string;
    enabled: boolean;
}

export interface CompanyInfo {
    id: string;
    name: string;
    business_type: string;
}

export interface AppState {
    theme: 'light' | 'dark';
    enabledModules: Record<string, boolean>; // Effective engines (user)
    companyModules: string[];
    userModules: string[];
    loadingModules: boolean;
    industry: any;
    company: CompanyInfo | null;
    pkg: any;
    capabilities: IndustryCapability[];
    setTheme: (theme: 'light' | 'dark') => void;
    toggleTheme: () => void;
    fetchModuleState: (targetCompanyId?: string) => Promise<void>;
    switchCompany: (companyId: string) => Promise<void>;
}

export const useIndustry = () => {
    const { industry, company } = useAppStore();
    // Authoritative check: active company's business_type strictly takes precedence
    const isSecurity = (company?.business_type?.toLowerCase() === 'security') || 
                       (!company?.business_type && industry?.code === 'security');
    return {
        isSecurity,
        industryCode: company?.business_type || industry?.code || 'universal',
        industryName: isSecurity ? 'Security Services' : (industry?.name || 'Universal')
    };
};

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
                company: null,
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

                fetchModuleState: async (targetCompanyId?: string) => {
                    const currentModules = get().enabledModules;
                    const hasData = Object.keys(currentModules).length > 0;
                    
                    if (!hasData) {
                        set({ loadingModules: true });
                    }
                    
                    try {
                        const compId = targetCompanyId || (typeof window !== 'undefined' ? localStorage.getItem('current_company_id') : null);
                        const url = compId ? `/api/platform/runtime-config/?company_id=${compId}` : '/api/platform/runtime-config/';
                        const response = await apiClient.get(url);
                        const data = response.data;
                        const newCompany = data.company || null;
                        const newIndustry = data.industry || null;
                        const isSec = (newCompany?.business_type?.toLowerCase() === 'security') || 
                                      (!newCompany?.business_type && newIndustry?.code === 'security');

                        set({ 
                            enabledModules: data.engines || {}, 
                            companyModules: data.company_modules || [],
                            userModules: data.user_modules || [],
                            industry: newIndustry,
                            company: newCompany,
                            pkg: data.package || null,
                            capabilities: data.capabilities || [],
                            loadingModules: false 
                        });

                        // Immediately prune/update stale tabs for the new company
                        useWorkspaceStore.getState().pruneStaleIndustryTabs(isSec);
                    } catch (error) {
                        console.error('Failed to fetch module state', error);
                        set({ loadingModules: false });
                    }
                },

                switchCompany: async (companyId: string) => {
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('current_company_id', companyId);
                    }
                    await get().fetchModuleState(companyId);
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
                company: state.company,
                pkg: state.pkg,
                capabilities: state.capabilities
            }),
        }
    )
);
