export interface ProcurementTag {
    id: number;
    name: string;
    color: string | null;
}

export interface ProcurementDocument {
    id: number;
    document_type: string;
    status: string;
    number: string;
    reference_number: string;
    document_date: string;
    expected_delivery_date: string | null;
    payment_terms: string;
    currency: string;
    exchange_rate: string;
    subtotal_amount: string;
    tax_amount: string;
    discount_amount: string;
    total_amount: string;
    crm_entity: number;
    crm_entity_name?: string;
    warehouse: number | null;
    parent_document: number | null;
    created_by: number | null;
    owner: number | null;
    notes: string;
    tags: number[];
    custom_fields: any;
    lines?: ProcurementLine[];
}

export interface ProcurementLine {
    id: number;
    document: number;
    item: number;
    item_name?: string;
    description: string;
    quantity: string;
    received_quantity: string;
    billed_quantity: string;
    returned_quantity: string;
    unit_price: string;
    discount_amount: string;
    tax_amount: string;
    total_amount: string;
    unit_of_measure: string;
    line_number: number;
    custom_fields: any;
}

export interface ApprovalWorkflow {
    id: number;
    name: string;
    module: string;
    document_type: string;
    active: boolean;
    min_amount: string;
    max_amount: string | null;
}

export interface ApprovalStep {
    id: number;
    workflow: number;
    step_number: number;
    name: string;
    approver_role: string;
    approver_user: number | null;
}

export interface ApprovalHistory {
    id: number;
    workflow: number;
    step: number | null;
    document_id: number;
    document_model: string;
    action: string;
    action_by: number | null;
    comments: string;
}
