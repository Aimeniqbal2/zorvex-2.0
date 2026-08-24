import { apiClient } from '../../api/client';
import type { 
    CRMEntity, CreateCRMEntityPayload, UpdateCRMEntityPayload, 
    CRMContact, CreateCRMContactPayload, UpdateCRMContactPayload,
    CRMAddress, CreateCRMAddressPayload, UpdateCRMAddressPayload,
    CRMCommunication, CreateCRMCommunicationPayload, UpdateCRMCommunicationPayload,
    CRMNote, CreateCRMNotePayload, UpdateCRMNotePayload,
    CRMAttachment, CreateCRMAttachmentPayload,
    PaginatedResponse, CRMEntityFilters,
    Opportunity, Proposal, ProposalLine, OpportunityAward,
    } from './types';

// ==========================================
// Helper for Pagination
// ==========================================

const handlePaginatedResponse = <T>(data: any): PaginatedResponse<T> => {
    if (Array.isArray(data)) {
        return {
            count: data.length,
            next: null,
            previous: null,
            results: data
        };
    }
    return data;
};

// ==========================================
// CRM Entities
// ==========================================

export const getEntities = async (filters?: CRMEntityFilters): Promise<PaginatedResponse<CRMEntity>> => {
    const params = new URLSearchParams();
    
    if (filters) {
        if (filters.page) params.append('page', filters.page.toString());
        if (filters.search) params.append('search', filters.search);
        if (filters.ordering) params.append('ordering', filters.ordering);
        if (filters.entity_type) params.append('entity_type', filters.entity_type);
        if (filters.status) params.append('status', filters.status);
        if (filters.active !== undefined) params.append('active', filters.active.toString());
    }

    const response = await apiClient.get(`/api/crm/entities/?${params.toString()}`);
    return handlePaginatedResponse<CRMEntity>(response.data);
};

export const getEntity = async (id: string): Promise<CRMEntity> => {
    const response = await apiClient.get(`/api/crm/entities/${id}/`);
    return response.data;
};

export const createEntity = async (payload: CreateCRMEntityPayload): Promise<CRMEntity> => {
    const response = await apiClient.post('/api/crm/entities/', payload);
    return response.data;
};

export const updateEntity = async (id: string, payload: UpdateCRMEntityPayload): Promise<CRMEntity> => {
    const response = await apiClient.patch(`/api/crm/entities/${id}/`, payload);
    return response.data;
};

export const deleteEntity = async (id: string): Promise<void> => {
    await apiClient.delete(`/api/crm/entities/${id}/`);
};

// ==========================================
// CRM Contacts
// ==========================================

export const getContacts = async (entityId: string): Promise<PaginatedResponse<CRMContact>> => {
    const response = await apiClient.get(`/api/crm/contacts/?entity=${entityId}`);
    return handlePaginatedResponse<CRMContact>(response.data);
};

export const createContact = async (payload: CreateCRMContactPayload): Promise<CRMContact> => {
    const response = await apiClient.post('/api/crm/contacts/', payload);
    return response.data;
};

export const updateContact = async (id: string, payload: UpdateCRMContactPayload): Promise<CRMContact> => {
    const response = await apiClient.patch(`/api/crm/contacts/${id}/`, payload);
    return response.data;
};

export const deleteContact = async (id: string): Promise<void> => {
    await apiClient.delete(`/api/crm/contacts/${id}/`);
};

// ==========================================
// CRM Addresses
// ==========================================

export const getAddresses = async (entityId: string): Promise<PaginatedResponse<CRMAddress>> => {
    const response = await apiClient.get(`/api/crm/addresses/?entity=${entityId}`);
    return handlePaginatedResponse<CRMAddress>(response.data);
};

export const createAddress = async (payload: CreateCRMAddressPayload): Promise<CRMAddress> => {
    const response = await apiClient.post('/api/crm/addresses/', payload);
    return response.data;
};

export const updateAddress = async (id: string, payload: UpdateCRMAddressPayload): Promise<CRMAddress> => {
    const response = await apiClient.patch(`/api/crm/addresses/${id}/`, payload);
    return response.data;
};

export const deleteAddress = async (id: string): Promise<void> => {
    await apiClient.delete(`/api/crm/addresses/${id}/`);
};

// ==========================================
// CRM Communications
// ==========================================

export const getCommunications = async (entityId: string): Promise<PaginatedResponse<CRMCommunication>> => {
    const response = await apiClient.get(`/api/crm/communications/?entity=${entityId}`);
    return handlePaginatedResponse<CRMCommunication>(response.data);
};

export const createCommunication = async (payload: CreateCRMCommunicationPayload): Promise<CRMCommunication> => {
    const response = await apiClient.post('/api/crm/communications/', payload);
    return response.data;
};

export const updateCommunication = async (id: string, payload: UpdateCRMCommunicationPayload): Promise<CRMCommunication> => {
    const response = await apiClient.patch(`/api/crm/communications/${id}/`, payload);
    return response.data;
};

export const deleteCommunication = async (id: string): Promise<void> => {
    await apiClient.delete(`/api/crm/communications/${id}/`);
};

// ==========================================
// CRM Notes
// ==========================================

export const getNotes = async (entityId: string): Promise<PaginatedResponse<CRMNote>> => {
    const response = await apiClient.get(`/api/crm/notes/?entity=${entityId}`);
    return handlePaginatedResponse<CRMNote>(response.data);
};

export const createNote = async (payload: CreateCRMNotePayload): Promise<CRMNote> => {
    const response = await apiClient.post('/api/crm/notes/', payload);
    return response.data;
};

export const updateNote = async (id: string, payload: UpdateCRMNotePayload): Promise<CRMNote> => {
    const response = await apiClient.patch(`/api/crm/notes/${id}/`, payload);
    return response.data;
};

export const deleteNote = async (id: string): Promise<void> => {
    await apiClient.delete(`/api/crm/notes/${id}/`);
};

// ==========================================
// CRM Attachments
// ==========================================

export const getAttachments = async (entityId: string): Promise<PaginatedResponse<CRMAttachment>> => {
    const response = await apiClient.get(`/api/crm/attachments/?entity=${entityId}`);
    return handlePaginatedResponse<CRMAttachment>(response.data);
};

export const createAttachment = async (payload: CreateCRMAttachmentPayload): Promise<CRMAttachment> => {
    const formData = new FormData();
    formData.append('entity', payload.entity);
    formData.append('file', payload.file);
    if (payload.description) {
        formData.append('description', payload.description);
    }
    
    const response = await apiClient.post('/api/crm/attachments/', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

export const deleteAttachment = async (id: string): Promise<void> => {
    await apiClient.delete(`/api/crm/attachments/${id}/`);
};

export const downloadAttachment = async (id: string, filename: string): Promise<void> => {
    const response = await apiClient.get(`/api/crm/attachments/${id}/download/`, {
        responseType: 'blob'
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(url);
};


// ==========================================
// Opportunities
// ==========================================

export interface OpportunityFilters {
    page?: number;
    search?: string;
    ordering?: string;
    stage?: string;
}

export const getOpportunities = async (filters?: OpportunityFilters): Promise<PaginatedResponse<Opportunity>> => {
    const params = new URLSearchParams();
    if (filters) {
        if (filters.page) params.append('page', filters.page.toString());
        if (filters.search) params.append('search', filters.search);
        if (filters.ordering) params.append('ordering', filters.ordering);
        if (filters.stage) params.append('stage', filters.stage);
    }
    const response = await apiClient.get(`/api/crm/opportunities/?${params.toString()}`);
    return handlePaginatedResponse<Opportunity>(response.data);
};

export const getOpportunity = async (id: string): Promise<Opportunity> => {
    const response = await apiClient.get(`/api/crm/opportunities/${id}/`);
    return response.data;
};

export const createOpportunity = async (payload: Partial<Opportunity>): Promise<Opportunity> => {
    const response = await apiClient.post('/api/crm/opportunities/', payload);
    return response.data;
};

export const updateOpportunity = async (id: string, payload: Partial<Opportunity>): Promise<Opportunity> => {
    const response = await apiClient.patch(`/api/crm/opportunities/${id}/`, payload);
    return response.data;
};

export const convertOpportunityToContract = async (id: string): Promise<{ status: string, contract_id: string }> => {
    const response = await apiClient.post(`/api/crm/opportunities/${id}/convert_to_contract/`);
    return response.data;
};

// ==========================================
// Proposals
// ==========================================

export interface ProposalFilters {
    page?: number;
    search?: string;
    ordering?: string;
    status?: string;
    opportunity?: string;
}

export const getProposals = async (filters?: ProposalFilters): Promise<PaginatedResponse<Proposal>> => {
    const params = new URLSearchParams();
    if (filters) {
        if (filters.page) params.append('page', filters.page.toString());
        if (filters.search) params.append('search', filters.search);
        if (filters.ordering) params.append('ordering', filters.ordering);
        if (filters.status) params.append('status', filters.status);
        if (filters.opportunity) params.append('opportunity', filters.opportunity);
    }
    const response = await apiClient.get(`/api/crm/proposals/?${params.toString()}`);
    return handlePaginatedResponse<Proposal>(response.data);
};

export const getProposal = async (id: string): Promise<Proposal> => {
    const response = await apiClient.get(`/api/crm/proposals/${id}/`);
    return response.data;
};

export const createProposal = async (payload: Partial<Proposal>): Promise<Proposal> => {
    const response = await apiClient.post('/api/crm/proposals/', payload);
    return response.data;
};

export const updateProposal = async (id: string, payload: Partial<Proposal>): Promise<Proposal> => {
    const response = await apiClient.patch(`/api/crm/proposals/${id}/`, payload);
    return response.data;
};

export const submitProposal = async (id: string): Promise<{ status: string }> => {
    const response = await apiClient.post(`/api/crm/proposals/${id}/submit/`);
    return response.data;
};

export const acceptProposal = async (id: string): Promise<{ status: string }> => {
    const response = await apiClient.post(`/api/crm/proposals/${id}/accept/`);
    return response.data;
};

// ==========================================
// Proposal Lines
// ==========================================

export const getProposalLines = async (proposalId: string): Promise<PaginatedResponse<ProposalLine>> => {
    const response = await apiClient.get(`/api/crm/proposal-lines/?proposal=${proposalId}`);
    return handlePaginatedResponse<ProposalLine>(response.data);
};

export const createProposalLine = async (payload: Partial<ProposalLine>): Promise<ProposalLine> => {
    const response = await apiClient.post('/api/crm/proposal-lines/', payload);
    return response.data;
};

export const updateProposalLine = async (id: string, payload: Partial<ProposalLine>): Promise<ProposalLine> => {
    const response = await apiClient.patch(`/api/crm/proposal-lines/${id}/`, payload);
    return response.data;
};

export const deleteProposalLine = async (id: string): Promise<void> => {
    await apiClient.delete(`/api/crm/proposal-lines/${id}/`);
};

// ==========================================
// Opportunity Awards
// ==========================================

export const getOpportunityAwards = async (opportunityId: string): Promise<PaginatedResponse<OpportunityAward>> => {
    const response = await apiClient.get(`/api/crm/awards/?opportunity=${opportunityId}`);
    return handlePaginatedResponse<OpportunityAward>(response.data);
};

export const createOpportunityAward = async (payload: Partial<OpportunityAward> | FormData): Promise<OpportunityAward> => {
    const headers = payload instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : undefined;
    const response = await apiClient.post('/api/crm/awards/', payload, { headers });
    return response.data;
};

export const downloadAwardAttachment = async (id: string, filename: string): Promise<void> => {
    const response = await apiClient.get(`/api/crm/awards/${id}/download/`, {
        responseType: 'blob'
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    window.URL.revokeObjectURL(url);
};
