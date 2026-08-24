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
    }
        }),
        {
            name: 'workspace-storage',
            partialize: (state) => ({ tabs: state.tabs, activeTabId: state.activeTabId }),
        }
    )
);
