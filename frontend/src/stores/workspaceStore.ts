import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ERPModule } from '../config/modules';

export interface WorkspaceTab {
    id: string; // The route path acts as a good ID, or module code. We'll use module code.
    moduleCode: string;
    title: string;
    path: string;
    icon: string;
}

export interface WorkspaceState {
    tabs: WorkspaceTab[];
    activeTabId: string | null;
    
    openTab: (module: ERPModule) => void;
    closeTab: (tabId: string) => void;
    closeOtherTabs: (tabId: string) => void;
    closeAllTabs: () => void;
    activateTab: (tabId: string) => void;
    hasTab: (tabId: string) => boolean;
    resetWorkspace: () => void;
    updateTab: (tabId: string, updates: Partial<WorkspaceTab>) => void;
    pruneStaleIndustryTabs: (isSecurity: boolean) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
    persist(
        (set, get) => ({
            tabs: [],
            activeTabId: null,

    openTab: (module: ERPModule) => {
        const { tabs, activeTabId } = get();
        const tabExists = tabs.find(t => t.id === module.code);

        if (!tabExists) {
            const newTab: WorkspaceTab = {
                id: module.code,
                moduleCode: module.code,
                title: module.name,
                path: module.route,
                icon: module.icon
            };
            set({
                tabs: [...tabs, newTab],
                activeTabId: newTab.id
            });
        } else if (activeTabId !== module.code) {
            set({ activeTabId: module.code });
        }
    },

    closeTab: (tabId: string) => {
        const { tabs, activeTabId } = get();
        const tabIndex = tabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) return;

        const newTabs = tabs.filter(t => t.id !== tabId);
        let newActiveTabId = activeTabId;

        if (activeTabId === tabId) {
            if (newTabs.length > 0) {
                // If closing active tab, activate the nearest logical tab
                const nextIndex = Math.min(tabIndex, newTabs.length - 1);
                newActiveTabId = newTabs[nextIndex].id;
            } else {
                newActiveTabId = null;
            }
        }

        set({ tabs: newTabs, activeTabId: newActiveTabId });
    },

    closeOtherTabs: (tabId: string) => {
        const { tabs } = get();
        const tab = tabs.find(t => t.id === tabId);
        if (tab) {
            set({ tabs: [tab], activeTabId: tabId });
        }
    },

    closeAllTabs: () => {
        set({ tabs: [], activeTabId: null });
    },

    activateTab: (tabId: string) => {
        set({ activeTabId: tabId });
    },

    hasTab: (tabId: string) => {
        return get().tabs.some(t => t.id === tabId);
    },

    resetWorkspace: () => {
        set({ tabs: [], activeTabId: null });
    },

    updateTab: (tabId: string, updates: Partial<WorkspaceTab>) => {
        const { tabs } = get();
        set({
            tabs: tabs.map(t => t.id === tabId ? { ...t, ...updates } : t)
        });
    },

    pruneStaleIndustryTabs: (isSecurity: boolean) => {
        const { tabs, activeTabId } = get();
        const securityOnlyCodes = ['security_ops', 'store_equipment', 'clients_contracts', 'security_finance', 'vendors_purchasing'];
        let updatedTabs = [...tabs];
        
        if (!isSecurity) {
            // In non-security company:
            // 1. Convert guards_staff to universal hr
            updatedTabs = updatedTabs.map(t => {
                if (t.moduleCode === 'guards_staff' || t.id === 'guards_staff') {
                    return {
                        ...t,
                        id: 'hr',
                        moduleCode: 'hr',
                        title: 'Human Resources',
                        path: '/app/hr',
                        icon: 'bx-group'
                    };
                }
                return t;
            });
            // 2. Remove other security-only tabs
            updatedTabs = updatedTabs.filter(t => !securityOnlyCodes.includes(t.moduleCode));
        } else {
            // In security company:
            // Convert universal hr to guards_staff
            updatedTabs = updatedTabs.map(t => {
                if (t.moduleCode === 'hr' || t.id === 'hr') {
                    return {
                        ...t,
                        id: 'guards_staff',
                        moduleCode: 'guards_staff',
                        title: 'Guards & Staff',
                        path: '/app/guards-staff',
                        icon: 'bx-shield-quarter'
                    };
                }
                return t;
            });
        }
        
        // Ensure activeTabId is valid
        let newActiveTabId = activeTabId;
        if (activeTabId && !updatedTabs.some(t => t.id === activeTabId)) {
            newActiveTabId = updatedTabs.length > 0 ? updatedTabs[0].id : null;
        }
        set({ tabs: updatedTabs, activeTabId: newActiveTabId });
    }
        }),
        {
            name: 'workspace-storage',
            partialize: (state) => ({ tabs: state.tabs, activeTabId: state.activeTabId }),
        }
    )
);
