import { create } from 'zustand';
import type { CRMEntityType } from '../types';

interface CrmState {
    activeTab: 'entities' | 'opportunities' | 'proposals';
    setActiveTab: (tab: 'entities' | 'opportunities' | 'proposals') => void;
    // Filter State
    activeEntityTypeFilter: CRMEntityType | '';
    search: string;
    page: number;
    ordering: string;
    
    // UI State
    selectedEntityId: string | null;
    selectedProposalId: string | null;
    selectedOpportunityId: string | null;

    // Actions
    setEntityTypeFilter: (type: CRMEntityType | '') => void;
    setSearch: (query: string) => void;
    setPage: (page: number) => void;
    setOrdering: (ordering: string) => void;
    setSelectedEntityId: (id: string | null) => void;
    setSelectedProposalId: (id: string | null) => void;
    setSelectedOpportunityId: (id: string | null) => void;
    resetFilters: () => void;
}

export const useCrmStore = create<CrmState>((set) => ({
    activeTab: 'entities',
    setActiveTab: (tab) => set({ activeTab: tab }),
    activeEntityTypeFilter: '',
    search: '',
    page: 1,
    ordering: '-created_at',
    selectedEntityId: null,
    selectedProposalId: null,
    selectedOpportunityId: null,

    setEntityTypeFilter: (type) => set({ activeEntityTypeFilter: type, page: 1 }),
    setSearch: (query) => set({ search: query, page: 1 }),
    setPage: (page) => set({ page }),
    setOrdering: (ordering) => set({ ordering, page: 1 }),
    setSelectedEntityId: (id) => set({ selectedEntityId: id }),
    setSelectedProposalId: (id) => set({ selectedProposalId: id }),
    setSelectedOpportunityId: (id) => set({ selectedOpportunityId: id }),
    resetFilters: () => set({ 
        activeEntityTypeFilter: '', 
        search: '', 
        page: 1, 
        ordering: '-created_at' 
    })
}));
