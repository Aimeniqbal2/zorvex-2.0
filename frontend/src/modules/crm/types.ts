export type CRMEntityType = 
    | 'PERSON' | 'COMPANY' | 'GOVERNMENT' | 'NGO' 
    | 'SUPPLIER' | 'CUSTOMER' | 'LEAD' | 'PARTNER' 
    | 'EMPLOYEE' | 'CONTRACTOR' | 'OTHER';

export type AddressType = 
    | 'Billing' | 'Shipping' | 'Office' 
    | 'Warehouse' | 'Home' | 'Other';

export interface CRMTag {
    id: string;
    name: string;
    color: string | null;
    created_at: string;
}

export interface CRMContact {
    id: string;
    entity: string;
    first_name: string;
    last_name: string;
    job_title: string;
    department: string;
    email: string;
    phone: string;
    mobile: string;
    whatsapp: string;
    is_primary: boolean;
    receives_invoices: boolean;
    receives_quotes: boolean;
    receives_notifications: boolean;
    created_at: string;
    updated_at: string;
}

export interface CRMAddress {
    id: string;
    entity: string;
    address_type: AddressType;
    line1: string;
    line2: string;
    city: string;
    state: string;
    country: string;
    postal_code: string;
    latitude: number | null;
    longitude: number | null;
    is_default: boolean;
    created_at: string;
    updated_at: string;
}

export interface CRMEntity {
    id: string;
    entity_type: CRMEntityType;
    name: string;
    display_name: string;
    code: string;
    status: string;
    active: boolean;
    notes: string;
    website: string;
    tax_number: string;
    registration_number: string;
    credit_limit: string | number;
    payment_terms: string;
    preferred_currency: string;
    preferred_language: string;
    created_by: string | null;
    owner: string | null;
    
    // Nested read-only components provided by DRF
    tags: CRMTag[];
    contacts: CRMContact[];
    addresses: CRMAddress[];
    
    created_at: string;
    updated_at: string;
}

// Write Payloads (following serializer write contracts)
export interface CreateCRMEntityPayload {
    entity_type: CRMEntityType;
    name: string;
    display_name?: string;
    code: string;
    status?: string;
    active?: boolean;
    notes?: string;
    website?: string;
    tax_number?: string;
    registration_number?: string;
    credit_limit?: string | number;
    payment_terms?: string;
    preferred_currency?: string;
    preferred_language?: string;
    owner?: string | null;
    tags_ids?: string[];
}

export type UpdateCRMEntityPayload = Partial<CreateCRMEntityPayload>;

export interface CreateCRMContactPayload {
    entity: string;
    first_name: string;
    last_name?: string;
    job_title?: string;
    department?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    whatsapp?: string;
    is_primary?: boolean;
    receives_invoices?: boolean;
    receives_quotes?: boolean;
    receives_notifications?: boolean;
}

export type UpdateCRMContactPayload = Partial<CreateCRMContactPayload>;

export interface CreateCRMAddressPayload {
    entity: string;
    address_type?: AddressType;
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    country?: string;
    postal_code?: string;
    latitude?: number | null;
    longitude?: number | null;
    is_default?: boolean;
}

export type UpdateCRMAddressPayload = Partial<CreateCRMAddressPayload>;

// Pagination generic response matching DRF
export interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

export interface CRMEntityFilters {
    page?: number;
    search?: string;
    ordering?: string;
    entity_type?: CRMEntityType | '';
    status?: string;
    active?: boolean | string;
}

export type CommunicationType = 'phone' | 'meeting' | 'email' | 'note' | 'whatsapp' | 'visit' | 'support' | 'quotation';

export interface CRMCommunication {
    id: string;
    entity: string;
    type: CommunicationType;
    subject: string;
    description: string;
    user: string | null;
    timestamp: string;
    created_at: string;
    updated_at: string;
}

export interface CreateCRMCommunicationPayload {
    entity: string;
    type: CommunicationType;
    subject: string;
    description?: string;
    timestamp: string;
}

export type UpdateCRMCommunicationPayload = Partial<CreateCRMCommunicationPayload>;

export interface CRMNote {
    id: string;
    entity: string;
    user: string | null;
    text: string;
    created_at: string;
    updated_at: string;
}

export interface CreateCRMNotePayload {
    entity: string;
    text: string;
}

export type UpdateCRMNotePayload = Partial<CreateCRMNotePayload>;

export interface CRMAttachment {
    id: string;
    entity: string;
    file: string; // URL
    uploaded_by: string | null;
    description: string;
    created_at: string;
    updated_at: string;
}

export interface CreateCRMAttachmentPayload {
    entity: string;
    file: File;
    description?: string;
}

export type UpdateCRMAttachmentPayload = Partial<Omit<CreateCRMAttachmentPayload, 'file'>>;

export type OpportunityStage = 'LEAD' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'AWARDED' | 'WON' | 'LOST';

export interface Opportunity {
    id: string;
    crm_entity: string;
    crm_entity_name: string;
    title: string;
    opportunity_number: string;
    stage: OpportunityStage;
    estimated_value: string | number;
    probability: string | number;
    expected_close_date: string | null;
    source: string;
    owner: string | null;
    owner_name: string;
    notes: string;
    loss_reason: string;
    competitor: string;
    converted_contract: string | null;
    converted_contract_code: string;
    created_at: string;
    updated_at: string;
}

export interface ProposalLine {
    id: string;
    proposal: string;
    description: string;
    designation: string | null;
    designation_name: string;
    quantity: string | number;
    unit: string;
    rate: string | number;
    amount: string | number;
    created_at: string;
    updated_at: string;
}

export type ProposalStatus = 'DRAFT' | 'INTERNAL_REVIEW' | 'SUBMITTED' | 'REVISED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export interface Proposal {
    id: string;
    opportunity: string;
    opportunity_title: string;
    proposal_number: string;
    title: string;
    version: number;
    issue_date: string;
    valid_until: string | null;
    status: ProposalStatus;
    currency: string;
    subtotal: string | number;
    tax_amount: string | number;
    total: string | number;
    scope: string;
    terms: string;
    notes: string;
    submitted_at: string | null;
    submitted_by: string | null;
    submitted_by_name: string;
    lines: ProposalLine[];
    created_at: string;
    updated_at: string;
}

export type AwardMethod = 'EMAIL' | 'LETTER' | 'PORTAL' | 'OTHER';

export interface OpportunityAward {
    id: string;
    opportunity: string;
    opportunity_title: string;
    proposal: string | null;
    proposal_number: string;
    method: AwardMethod;
    award_reference: string;
    award_date: string;
    effective_date: string | null;
    notes: string;
    attachment: string | null;
    created_at: string;
    updated_at: string;
}
