import { apiClient as api } from '../../../api/client';

export interface VendorCategory {
    id: string;
    name: string;
    code: string;
    description: string;
    is_active: boolean;
    vendors_count?: number;
    created_at?: string;
    updated_at?: string;
}

export interface Vendor {
    id: string;
    code: string;
    name: string;
    category?: string | null;
    category_name?: string;
    crm_entity?: string | null;
    contact_person: string;
    phone: string;
    email: string;
    address: string;
    website: string;
    tax_number: string;
    registration_number: string;
    payment_terms: string;
    credit_limit: string | number;
    bank_name: string;
    account_title: string;
    account_number: string;
    iban: string;
    swift_code: string;
    status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED' | 'PENDING_REVIEW';
    rating: number;
    notes: string;
    items_count?: number;
    documents_count?: number;
    contacts_count?: number;
    total_purchases?: string | number;
    outstanding_payable?: string | number;
    total_paid?: string | number;
    created_at: string;
    updated_at: string;
}

export interface VendorContact {
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
}

export interface VendorItem {
    id: string;
    vendor: string;
    vendor_name?: string;
    item: string;
    item_name?: string;
    item_sku?: string;
    item_brand?: string;
    item_category_name?: string;
    item_unit_of_measure?: string;
    item_cost_price?: string | number;
    item_selling_price?: string | number;
    vendor_sku: string;
    vendor_price: string | number;
    currency: string;
    minimum_order_quantity: string | number;
    lead_time_days: number;
    last_purchase_price?: string | number | null;
    is_preferred: boolean;
    is_active: boolean;
    notes: string;
    created_at?: string;
    updated_at?: string;
}

export interface VendorDocument {
    id: string;
    vendor: string;
    document_type: 'AGREEMENT' | 'TAX_CERTIFICATE' | 'BANK_DETAILS' | 'QUOTATION' | 'PRICE_LIST' | 'WARRANTY' | 'OTHER';
    document_type_display?: string;
    title: string;
    file: string;
    file_url?: string;
    uploaded_by?: string;
    uploaded_by_name?: string;
    notes: string;
    created_at: string;
    updated_at: string;
}

export interface UniversalItem {
    id: string;
    name: string;
    sku?: string;
    item_code?: string;
    brand?: string;
    category?: string;
    category_name?: string;
    unit_of_measure?: string;
    cost_price?: number | string;
    selling_price?: number | string;
    is_active?: boolean;
}

// Vendor Endpoints
export const getVendors = async (params?: { search?: string; category?: string; status?: string }): Promise<Vendor[]> => {
    const res = await api.get('/api/purchasing/vendors/', { params });
    return res.data.results || res.data;
};

export const getVendor = async (id: string): Promise<Vendor> => {
    const res = await api.get(`/api/purchasing/vendors/${id}/`);
    return res.data;
};

export const createVendor = async (data: Partial<Vendor>): Promise<Vendor> => {
    const res = await api.post('/api/purchasing/vendors/', data);
    return res.data;
};

export const updateVendor = async (id: string, data: Partial<Vendor>): Promise<Vendor> => {
    const res = await api.patch(`/api/purchasing/vendors/${id}/`, data);
    return res.data;
};

export const deleteVendor = async (id: string): Promise<void> => {
    await api.delete(`/api/purchasing/vendors/${id}/`);
};

// Vendor Categories Endpoints
export const getVendorCategories = async (): Promise<VendorCategory[]> => {
    const res = await api.get('/api/purchasing/vendor-categories/');
    return res.data.results || res.data;
};

export const createVendorCategory = async (data: { name: string; code?: string; description?: string }): Promise<VendorCategory> => {
    const res = await api.post('/api/purchasing/vendor-categories/', data);
    return res.data;
};

// Vendor Contacts Endpoints
export const getVendorContacts = async (vendorId: string): Promise<VendorContact[]> => {
    const res = await api.get(`/api/purchasing/vendors/${vendorId}/contacts/`);
    return res.data;
};

export const createVendorContact = async (vendorId: string, data: Partial<VendorContact>): Promise<VendorContact> => {
    const res = await api.post(`/api/purchasing/vendors/${vendorId}/contacts/`, data);
    return res.data;
};

export const updateVendorContact = async (contactId: string, data: Partial<VendorContact>): Promise<VendorContact> => {
    const res = await api.patch(`/api/crm/contacts/${contactId}/`, data);
    return res.data;
};

export const deleteVendorContact = async (contactId: string): Promise<void> => {
    await api.delete(`/api/crm/contacts/${contactId}/`);
};

// Vendor Items Endpoints
export const getVendorItems = async (vendorId?: string, itemId?: string): Promise<VendorItem[]> => {
    const params: any = {};
    if (vendorId) params.vendor = vendorId;
    if (itemId) params.item = itemId;
    const res = await api.get('/api/purchasing/vendor-items/', { params });
    return res.data.results || res.data;
};

export const createVendorItem = async (data: Partial<VendorItem>): Promise<VendorItem> => {
    const res = await api.post('/api/purchasing/vendor-items/', data);
    return res.data;
};

export const updateVendorItem = async (id: string, data: Partial<VendorItem>): Promise<VendorItem> => {
    const res = await api.patch(`/api/purchasing/vendor-items/${id}/`, data);
    return res.data;
};

export const deleteVendorItem = async (id: string): Promise<void> => {
    await api.delete(`/api/purchasing/vendor-items/${id}/`);
};

// Vendor Documents Endpoints
export const getVendorDocuments = async (vendorId: string): Promise<VendorDocument[]> => {
    const res = await api.get(`/api/purchasing/vendors/${vendorId}/documents/`);
    return res.data.results || res.data;
};

export const uploadVendorDocument = async (vendorId: string, formData: FormData): Promise<VendorDocument> => {
    const res = await api.post(`/api/purchasing/vendors/${vendorId}/documents/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data;
};

export const deleteVendorDocument = async (id: string): Promise<void> => {
    await api.delete(`/api/purchasing/vendor-documents/${id}/`);
};

export interface PurchaseOrderLine {
    id?: string;
    item: string;
    item_sku?: string;
    item_name?: string;
    item_brand?: string;
    item_category_name?: string;
    vendor_item?: string | null;
    vendor_sku?: string;
    description?: string;
    quantity: number | string;
    received_quantity?: number | string;
    billed_quantity?: number | string;
    returned_quantity?: number | string;
    remaining_quantity?: number | string;
    unit_price: number | string;
    discount_amount?: number | string;
    tax_amount?: number | string;
    total_amount?: number | string;
    unit_of_measure?: string;
    expected_delivery_date?: string | null;
    notes?: string;
    line_number?: number;
}

export interface PurchaseOrder {
    id: string;
    document_type: string;
    status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SENT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED' | 'CLOSED';
    number: string;
    reference_number?: string;
    document_date: string;
    expected_delivery_date?: string | null;
    payment_terms?: string;
    currency: string;
    exchange_rate?: number | string;
    subtotal_amount: number | string;
    tax_amount: number | string;
    discount_amount: number | string;
    total_amount: number | string;
    vendor?: string | null;
    vendor_name?: string;
    vendor_code?: string;
    crm_entity?: string | null;
    crm_entity_name?: string;
    warehouse?: string | null;
    warehouse_name?: string;
    created_by?: string;
    created_by_name?: string;
    approved_by?: string | null;
    approved_by_name?: string;
    approved_at?: string | null;
    approval_notes?: string;
    rejection_reason?: string;
    notes?: string;
    lines: PurchaseOrderLine[];
    notes_rel?: any[];
    attachments?: any[];
    audit_trails?: any[];
    created_at: string;
    updated_at: string;
}

export interface Warehouse {
    id: string;
    name: string;
    code: string;
    address?: string;
}

// Purchase Order Endpoints
export const getPurchaseOrders = async (params?: { 
    search?: string; 
    vendor?: string; 
    status?: string;
    warehouse?: string;
}): Promise<PurchaseOrder[]> => {
    const queryParams = { ...params, document_type: 'PURCHASE_ORDER' };
    const res = await api.get('/api/purchasing/documents/', { params: queryParams });
    return res.data.results || res.data;
};

export const getPurchaseOrder = async (id: string): Promise<PurchaseOrder> => {
    const res = await api.get(`/api/purchasing/documents/${id}/`);
    return res.data;
};

export const createPurchaseOrder = async (data: Partial<PurchaseOrder>): Promise<PurchaseOrder> => {
    const payload = { ...data, document_type: 'PURCHASE_ORDER' };
    const res = await api.post('/api/purchasing/documents/', payload);
    return res.data;
};

export const updatePurchaseOrder = async (id: string, data: Partial<PurchaseOrder>): Promise<PurchaseOrder> => {
    const res = await api.patch(`/api/purchasing/documents/${id}/`, data);
    return res.data;
};

export const deletePurchaseOrder = async (id: string): Promise<void> => {
    await api.delete(`/api/purchasing/documents/${id}/`);
};

export const submitPurchaseOrderForApproval = async (id: string): Promise<PurchaseOrder> => {
    const res = await api.post(`/api/purchasing/documents/${id}/submit_for_approval/`);
    return res.data;
};

export const approvePurchaseOrder = async (id: string, approvalNotes?: string): Promise<PurchaseOrder> => {
    const res = await api.post(`/api/purchasing/documents/${id}/approve/`, {
        approval_notes: approvalNotes || ''
    });
    return res.data;
};

export const rejectPurchaseOrder = async (id: string, reason: string): Promise<PurchaseOrder> => {
    const res = await api.post(`/api/purchasing/documents/${id}/reject/`, {
        reason: reason || ''
    });
    return res.data;
};

export const sendPurchaseOrder = async (id: string): Promise<PurchaseOrder> => {
    const res = await api.post(`/api/purchasing/documents/${id}/send/`);
    return res.data;
};

export const cancelPurchaseOrder = async (id: string, reason?: string): Promise<PurchaseOrder> => {
    const res = await api.post(`/api/purchasing/documents/${id}/cancel/`, {
        reason: reason || ''
    });
    return res.data;
};

// Warehouses Endpoint
export const getWarehouses = async (): Promise<Warehouse[]> => {
    try {
        const res = await api.get('/api/platform/warehouses/');
        return res.data.results || res.data;
    } catch {
        return [];
    }
};

// Universal Inventory Items for item catalogue picker
export const getUniversalInventoryItems = async (): Promise<UniversalItem[]> => {
    try {
        const res = await api.get('/api/inventory/items/');
        return res.data.results || res.data;
    } catch {
        return [];
    }
};

// ==========================================
// PHASE S-3C: GOODS RECEIPTS (GRN) INTERFACES & API
// ==========================================

export interface GoodsReceiptLine {
    id?: string;
    document?: string;
    parent_line?: string;
    item: string;
    item_sku?: string;
    item_name?: string;
    item_brand?: string;
    item_category_name?: string;
    vendor_item?: string | null;
    vendor_sku?: string;
    description?: string;
    quantity: number | string; // Total received = accepted + rejected
    accepted_quantity: number | string;
    rejected_quantity?: number | string;
    rejection_reason?: string;
    unit_price?: number | string;
    total_amount?: number | string;
    unit_of_measure?: string;
    line_number?: number;
    notes?: string;
    custom_fields?: {
        po_line_id?: string;
        serial_numbers?: string[];
    };
    created_at?: string;
}

export interface GoodsReceipt {
    id: string;
    document_type: 'GOODS_RECEIPT';
    status: 'DRAFT' | 'POSTED' | 'CANCELLED';
    number: string;
    reference_number: string;
    document_date: string;
    vendor?: string | null;
    vendor_name?: string;
    vendor_code?: string;
    crm_entity?: string | null;
    crm_entity_name?: string;
    warehouse?: string | null;
    warehouse_name?: string;
    parent_document?: string | null;
    parent_document_number?: string;
    created_by?: string;
    created_by_name?: string;
    notes?: string;
    lines: GoodsReceiptLine[];
    attachments?: any[];
    audit_trails?: any[];
    created_at: string;
    updated_at: string;
}

export interface POReceivingSummaryLine {
    po_line_id: string;
    item_id: string;
    item_name: string;
    item_code: string;
    unit_of_measure: string;
    ordered_quantity: number;
    previously_received: number;
    remaining_quantity: number;
    unit_price: number;
    track_serial_number: boolean;
}

export interface POReceivingSummaryGRN {
    id: string;
    number: string;
    status: 'DRAFT' | 'POSTED' | 'CANCELLED';
    document_date: string;
    warehouse_name: string;
    warehouse_id: string;
    reference_number: string;
    total_accepted_quantity: number;
    total_rejected_quantity: number;
    lines_count: number;
    notes: string;
    created_by_name: string;
    created_at: string;
}

export interface POReceivingSummary {
    po_id: string;
    po_number: string;
    po_status: string;
    vendor_id: string;
    vendor_name: string;
    can_receive: boolean;
    lines: POReceivingSummaryLine[];
    grns: POReceivingSummaryGRN[];
}

export const getGoodsReceipts = async (params?: {
    search?: string;
    vendor?: string;
    status?: string;
    warehouse?: string;
    parent_document?: string;
}): Promise<GoodsReceipt[]> => {
    const queryParams = { ...params, document_type: 'GOODS_RECEIPT' };
    const res = await api.get('/api/purchasing/documents/', { params: queryParams });
    return res.data.results || res.data;
};

export const getGoodsReceipt = async (id: string): Promise<GoodsReceipt> => {
    const res = await api.get(`/api/purchasing/documents/${id}/`);
    return res.data;
};

export const receiveGoods = async (poId: string, data: {
    warehouse: string;
    document_date?: string;
    reference_number?: string;
    notes?: string;
    post_now?: boolean;
    lines: Array<{
        po_line_id: string;
        quantity: number;
        accepted_quantity: number;
        rejected_quantity?: number;
        rejection_reason?: string;
        notes?: string;
        serial_numbers?: string[];
    }>;
}): Promise<GoodsReceipt> => {
    const res = await api.post(`/api/purchasing/documents/${poId}/receive_goods/`, data);
    return res.data;
};

export const postGoodsReceipt = async (id: string): Promise<GoodsReceipt> => {
    const res = await api.post(`/api/purchasing/documents/${id}/post_receipt/`);
    return res.data;
};

export const cancelGoodsReceipt = async (id: string): Promise<GoodsReceipt> => {
    const res = await api.post(`/api/purchasing/documents/${id}/cancel_receipt/`);
    return res.data;
};

export const getPOReceivingSummary = async (poId: string): Promise<POReceivingSummary> => {
    const res = await api.get(`/api/purchasing/documents/${poId}/receiving_summary/`);
    return res.data;
};

// ===========================================================================
// Phase S-3D: Vendor Invoice & Three-Way Matching API
// ===========================================================================

export interface VendorInvoiceLine {
    id?: string;
    parent_line?: string;
    item: string;
    item_sku?: string;
    item_name?: string;
    item_brand?: string;
    item_category_name?: string;
    vendor_item?: string | null;
    vendor_sku?: string;
    description?: string;
    quantity: number | string;
    unit_price: number | string;
    discount_amount?: number | string;
    tax_amount?: number | string;
    total_amount?: number | string;
    notes?: string;
    line_number?: number;
}

export interface MatchLineDetail {
    po_line_id: string;
    item_id: string;
    item_name: string;
    item_sku: string;
    ordered_quantity: number;
    expected_price: number;
    accepted_quantity: number;
    previously_billed: number;
    remaining_billable: number;
    invoiced_quantity: number;
    invoiced_price: number;
    price_variance: number;
    variance_percentage: number;
    quantity_matched: boolean;
    price_matched: boolean;
    discrepancy_reasons: string[];
}

export interface ThreeWayMatchDetails {
    invoice_id: string;
    invoice_number: string;
    po_id: string;
    po_number: string;
    overall_match_status: 'MATCHED' | 'QUANTITY_MISMATCH' | 'PRICE_MISMATCH' | 'MISMATCH' | 'PENDING';
    mismatch_flags: string[];
    summary: {
        total_lines: number;
        matched_lines: number;
        discrepant_lines: number;
        total_invoiced_amount: number;
        net_price_variance: number;
    };
    lines: MatchLineDetail[];
    matched_at: string;
}

export interface VendorInvoice {
    id: string;
    document_type: 'VENDOR_INVOICE';
    status: 'DRAFT' | 'PENDING_MATCH' | 'MATCHED' | 'MISMATCH' | 'APPROVED' | 'POSTED' | 'CANCELLED';
    number: string;
    reference_number?: string;
    vendor_invoice_number: string;
    document_date: string;
    due_date?: string | null;
    currency: string;
    exchange_rate?: number | string;
    subtotal_amount: number | string;
    tax_amount: number | string;
    discount_amount: number | string;
    freight_amount: number | string;
    total_amount: number | string;
    vendor?: string;
    vendor_name?: string;
    vendor_code?: string;
    parent_document?: string;
    parent_document_number?: string;
    created_by_name?: string;
    approved_by_name?: string;
    approved_at?: string;
    match_status?: 'MATCHED' | 'QUANTITY_MISMATCH' | 'PRICE_MISMATCH' | 'MISMATCH' | 'PENDING_MATCH' | '';
    match_details?: ThreeWayMatchDetails;
    override_by_name?: string;
    override_at?: string;
    override_reason?: string;
    ap_ready: boolean;
    paid_amount?: number | string;
    outstanding_amount?: number | string;
    is_overdue?: boolean;
    payment_status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
    notes?: string;
    lines: VendorInvoiceLine[];
    attachments?: any[];
    audit_trails?: any[];
    created_at: string;
    updated_at: string;
}

export interface VendorPaymentAllocation {
    id: string;
    payment?: string;
    invoice: string;
    invoice_number: string;
    vendor_invoice_number: string;
    invoice_total_amount: number | string;
    parent_po_number: string;
    amount: number | string;
    notes?: string;
    created_at?: string;
}

export interface VendorPayment {
    id: string;
    payment_number: string;
    vendor: string;
    vendor_name?: string;
    vendor_code?: string;
    payment_date: string;
    payment_method: 'BANK_TRANSFER' | 'CASH' | 'CHEQUE' | 'ONLINE_TRANSFER' | 'OTHER';
    payment_method_display?: string;
    bank_cash_account?: string;
    account?: string | null;
    account_code?: string;
    account_name?: string;
    amount: number | string;
    currency: string;
    reference_number?: string;
    cheque_number?: string;
    cheque_date?: string | null;
    status: 'DRAFT' | 'POSTED' | 'CANCELLED' | 'REVERSED';
    notes?: string;
    paid_by?: string;
    paid_by_name?: string;
    created_by?: string;
    created_by_name?: string;
    posted_by?: string;
    posted_by_name?: string;
    posted_at?: string | null;
    reversed_by?: string;
    reversed_by_name?: string;
    reversed_at?: string | null;
    reversal_reason?: string;
    allocations: VendorPaymentAllocation[];
    allocated_amount?: number | string;
    unallocated_amount?: number | string;
    created_at: string;
    updated_at: string;
}

export interface AccountsPayableItem {
    invoice_id: string;
    invoice_number: string;
    vendor_invoice_number: string;
    vendor_id: string | null;
    vendor_name: string;
    vendor_code: string;
    parent_document_id: string | null;
    parent_document_number: string;
    document_date: string;
    due_date: string | null;
    currency: string;
    total_amount: number | string;
    original_amount?: number | string;
    return_credit?: number | string;
    net_amount?: number | string;
    paid_amount: number | string;
    outstanding_amount: number | string;
    unallocated_credit?: number | string;
    payment_status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
    is_overdue: boolean;
    created_at: string;
}

export interface VendorPayableSummary {
    vendor_id: string;
    total_purchases: number | string;
    total_paid: number | string;
    outstanding_payable: number | string;
    overdue_payable: number | string;
    total_posted_invoices_count: number;
    unpaid_invoices_count: number;
    overdue_invoices_count: number;
    total_payments_count: number;
}

export interface POBillingSummaryLine {
    po_line_id: string;
    item_id: string;
    item_name: string;
    item_code: string;
    ordered_quantity: number;
    accepted_quantity: number;
    billed_quantity: number;
    previously_billed_quantity?: number;
    remaining_billable_quantity: number;
    unit_price: number;
    tax_rate?: number;
    line_total?: number;
    total_amount: number;
    billing_status: 'UNBILLED' | 'PARTIALLY_BILLED' | 'FULLY_BILLED';
}

export interface POBillingSummaryInvoice {
    id: string;
    number: string;
    vendor_invoice_number: string;
    reference_number: string;
    document_date: string;
    due_date: string | null;
    status: string;
    match_status: string;
    subtotal_amount: number;
    tax_amount: number;
    discount_amount: number;
    freight_amount: number;
    total_amount: number;
    ap_ready: boolean;
    payment_status: string;
    override_by: string | null;
    override_reason: string;
}

export interface POBillingSummary {
    po_id: string;
    po_number: string;
    lines: POBillingSummaryLine[];
    invoices: POBillingSummaryInvoice[];
}

export const getVendorInvoices = async (params?: {
    search?: string;
    vendor?: string;
    status?: string;
    match_status?: string;
    parent_document?: string;
    ap_ready?: boolean;
}): Promise<VendorInvoice[]> => {
    const queryParams = { ...params, document_type: 'VENDOR_INVOICE' };
    const res = await api.get('/api/purchasing/documents/', { params: queryParams });
    return res.data.results || res.data;
};

export const getVendorInvoice = async (id: string): Promise<VendorInvoice> => {
    const res = await api.get(`/api/purchasing/documents/${id}/`);
    return res.data;
};

export const createVendorInvoice = async (poId: string, data: {
    vendor_invoice_number: string;
    document_date?: string;
    due_date?: string;
    reference_number?: string;
    freight_amount?: number;
    notes?: string;
    lines: Array<{
        po_line_id: string;
        quantity: number;
        unit_price?: number;
        discount_amount?: number;
        tax_amount?: number;
        notes?: string;
    }>;
}): Promise<VendorInvoice> => {
    const res = await api.post(`/api/purchasing/documents/${poId}/create_invoice/`, data);
    return res.data;
};

export const runThreeWayMatch = async (invoiceId: string): Promise<{ invoice: VendorInvoice; match_details: ThreeWayMatchDetails }> => {
    const res = await api.post(`/api/purchasing/documents/${invoiceId}/run_match/`);
    return res.data;
};

export const overrideMismatch = async (invoiceId: string, reason: string): Promise<VendorInvoice> => {
    const res = await api.post(`/api/purchasing/documents/${invoiceId}/override_mismatch/`, { reason });
    return res.data;
};

export const approveVendorInvoice = async (invoiceId: string): Promise<VendorInvoice> => {
    const res = await api.post(`/api/purchasing/documents/${invoiceId}/approve_invoice/`);
    return res.data;
};

export const postVendorBill = async (invoiceId: string): Promise<VendorInvoice> => {
    const res = await api.post(`/api/purchasing/documents/${invoiceId}/post_bill/`);
    return res.data;
};

export const cancelVendorInvoice = async (invoiceId: string, reason?: string): Promise<VendorInvoice> => {
    const res = await api.post(`/api/purchasing/documents/${invoiceId}/cancel_invoice/`, { reason });
    return res.data;
};

export const getPOBillingSummary = async (poId: string): Promise<POBillingSummary> => {
    const res = await api.get(`/api/purchasing/documents/${poId}/billing_summary/`);
    return res.data;
};

// -------------------------------------------------------------
// Phase S-3E: Vendor Payments & Accounts Payable Endpoints
// -------------------------------------------------------------

export const getVendorPayments = async (params?: {
    search?: string;
    vendor?: string;
    status?: string;
    payment_method?: string;
}): Promise<VendorPayment[]> => {
    const res = await api.get('/api/purchasing/payments/', { params });
    return res.data.results || res.data;
};

export const getVendorPayment = async (id: string): Promise<VendorPayment> => {
    const res = await api.get(`/api/purchasing/payments/${id}/`);
    return res.data;
};

export const createVendorPayment = async (data: {
    vendor: string;
    payment_date: string;
    amount: number | string;
    payment_method?: string;
    bank_cash_account?: string;
    account?: string | null;
    reference_number?: string;
    cheque_number?: string;
    cheque_date?: string | null;
    notes?: string;
    allocations?: Array<{
        invoice_id: string;
        amount: number | string;
        notes?: string;
    }>;
    auto_post?: boolean;
}): Promise<VendorPayment> => {
    const res = await api.post('/api/purchasing/payments/', data);
    return res.data;
};

export const postVendorPayment = async (id: string): Promise<VendorPayment> => {
    const res = await api.post(`/api/purchasing/payments/${id}/post_payment/`);
    return res.data;
};

export const reverseVendorPayment = async (id: string, reversal_reason: string): Promise<VendorPayment> => {
    const res = await api.post(`/api/purchasing/payments/${id}/reverse_payment/`, { reversal_reason });
    return res.data;
};

export const cancelDraftPayment = async (id: string): Promise<VendorPayment> => {
    const res = await api.post(`/api/purchasing/payments/${id}/cancel_payment/`);
    return res.data;
};

export const getVendorPayableSummary = async (vendorId: string): Promise<VendorPayableSummary> => {
    const res = await api.get(`/api/purchasing/vendors/${vendorId}/payable_summary/`);
    return res.data;
};

export const getAccountsPayableList = async (params?: {
    vendor?: string;
    status?: string;
    search?: string;
}): Promise<AccountsPayableItem[]> => {
    const res = await api.get('/api/purchasing/documents/payables/', { params });
    return res.data.results || res.data;
};

// -------------------------------------------------------------
// Phase S-3F: Purchase Returns & Vendor Credit Notes
// -------------------------------------------------------------

export type PurchaseReturnReason = 
    | 'DAMAGED' 
    | 'DEFECTIVE' 
    | 'WRONG_ITEM' 
    | 'EXCESS_QUANTITY' 
    | 'QUALITY_REJECTED' 
    | 'WARRANTY_RETURN' 
    | 'OTHER';

export type PurchaseReturnStatus = 
    | 'DRAFT' 
    | 'PENDING_APPROVAL' 
    | 'APPROVED' 
    | 'POSTED' 
    | 'CANCELLED';

export interface PurchaseReturnLine {
    id?: string;
    purchase_return?: string;
    grn_line?: string;
    grn_line_number?: number;
    item: string;
    item_name?: string;
    item_code?: string;
    item_sku?: string;
    item_unit_of_measure?: string;
    track_serial_number?: boolean;
    description?: string;
    received_quantity: number | string;
    previously_returned_quantity?: number | string;
    return_quantity: number | string;
    unit_cost: number | string;
    total_amount?: number | string;
    reason?: string;
    serial_numbers?: string[];
    is_rejected_at_grn?: boolean;
    line_number?: number;
    notes?: string;
    created_at?: string;
}

export interface PurchaseReturn {
    id: string;
    return_number: string;
    vendor: string;
    vendor_name?: string;
    vendor_code?: string;
    warehouse: string;
    warehouse_name?: string;
    purchase_order?: string;
    purchase_order_number?: string;
    goods_receipt?: string;
    goods_receipt_number?: string;
    vendor_invoice?: string;
    vendor_invoice_number?: string;
    return_date: string;
    reason: PurchaseReturnReason;
    reason_display?: string;
    status: PurchaseReturnStatus;
    total_return_amount: number | string;
    currency: string;
    notes?: string;
    rejection_reason?: string;
    created_by?: string;
    created_by_name?: string;
    approved_by?: string;
    approved_by_name?: string;
    approved_at?: string | null;
    posted_by?: string;
    posted_by_name?: string;
    posted_at?: string | null;
    cancelled_by?: string;
    cancelled_by_name?: string;
    cancelled_at?: string | null;
    lines: PurchaseReturnLine[];
    credit_notes_count?: number;
    credit_note_number?: string | null;
    created_at: string;
    updated_at: string;
}

export interface VendorCreditNote {
    id: string;
    credit_note_number: string;
    vendor: string;
    vendor_name?: string;
    vendor_code?: string;
    purchase_return: string;
    return_number?: string;
    vendor_invoice?: string;
    invoice_number?: string;
    vendor_invoice_number?: string;
    credit_date: string;
    amount: number | string;
    allocated_amount: number | string;
    unallocated_amount: number | string;
    status: 'POSTED' | 'CANCELLED';
    currency: string;
    notes?: string;
    created_by_name?: string;
    created_at: string;
    updated_at: string;
}

export interface ReturnableGRNLine {
    grn_line_id: string;
    line_number: number;
    item_id: string;
    item_name: string;
    item_sku: string;
    track_serial_number: boolean;
    unit_of_measure: string;
    unit_cost: number;
    received_qty: number;
    accepted_qty: number;
    rejected_qty: number;
    already_returned_qty: number;
    returnable_qty: number;
    available_serials: string[];
}

export interface VendorReturnsSummary {
    total_returns_count: number;
    posted_returns_count: number;
    draft_returns_count: number;
    total_returned_value: number;
    total_credit_notes_count: number;
    total_credit_notes_amount: number;
    total_unallocated_credit: number;
}

export const getPurchaseReturns = async (params?: {
    vendor?: string;
    status?: string;
    warehouse?: string;
    goods_receipt?: string;
    purchase_order?: string;
    vendor_invoice?: string;
    search?: string;
}): Promise<PurchaseReturn[]> => {
    const res = await api.get('/api/purchasing/returns/', { params });
    return res.data.results || res.data;
};

export const getPurchaseReturn = async (id: string): Promise<PurchaseReturn> => {
    const res = await api.get(`/api/purchasing/returns/${id}/`);
    return res.data;
};

export const createPurchaseReturn = async (data: {
    vendor: string;
    warehouse: string;
    return_date?: string;
    reason: PurchaseReturnReason;
    lines: Array<{
        grn_line_id?: string;
        item_id: string;
        description?: string;
        return_quantity: number | string;
        unit_cost?: number | string;
        reason?: string;
        serial_numbers?: string[];
        is_rejected_at_grn?: boolean;
        notes?: string;
    }>;
    purchase_order?: string;
    goods_receipt?: string;
    vendor_invoice?: string;
    notes?: string;
    auto_approve?: boolean;
}): Promise<PurchaseReturn> => {
    const res = await api.post('/api/purchasing/returns/', data);
    return res.data;
};

export const submitReturnForApproval = async (id: string): Promise<PurchaseReturn> => {
    const res = await api.post(`/api/purchasing/returns/${id}/submit_for_approval/`);
    return res.data;
};

export const approvePurchaseReturn = async (id: string): Promise<PurchaseReturn> => {
    const res = await api.post(`/api/purchasing/returns/${id}/approve/`);
    return res.data;
};

export const postPurchaseReturn = async (id: string): Promise<{
    return: PurchaseReturn;
    credit_note_id: string;
    credit_note_number: string;
    allocated_amount: string;
    unallocated_amount: string;
}> => {
    const res = await api.post(`/api/purchasing/returns/${id}/post_return/`);
    return res.data;
};

export const cancelPurchaseReturn = async (id: string, reason?: string): Promise<PurchaseReturn> => {
    const res = await api.post(`/api/purchasing/returns/${id}/cancel_return/`, { reason });
    return res.data;
};

export const getReturnableGrnLines = async (grnId: string): Promise<ReturnableGRNLine[]> => {
    const res = await api.get('/api/purchasing/returns/returnable_lines/', {
        params: { goods_receipt: grnId }
    });
    return res.data;
};

export const getVendorCreditNotes = async (params?: {
    vendor?: string;
    vendor_invoice?: string;
    search?: string;
}): Promise<VendorCreditNote[]> => {
    const res = await api.get('/api/purchasing/credit-notes/', { params });
    return res.data.results || res.data;
};

export const getVendorReturnsSummary = async (vendorId: string): Promise<VendorReturnsSummary> => {
    const res = await api.get(`/api/purchasing/vendors/${vendorId}/returns_summary/`);
    return res.data;
};

// ===========================================================================
// PHASE S-3G: VENDOR STATEMENT, AP AGING & RECONCILIATION
// ===========================================================================

export interface StatementTransaction {
    date: string;
    transaction_type: 'INVOICE' | 'PAYMENT' | 'PAYMENT_REVERSAL' | 'CREDIT_NOTE';
    type_display: string;
    reference: string;
    vendor_reference: string;
    parent_reference: string;
    description: string;
    debit: number | string;
    credit: number | string;
    running_balance: number | string;
    status: string;
    due_date?: string | null;
    source_id: string;
}

export interface VendorStatement {
    vendor_id: string;
    vendor_name: string;
    vendor_code: string;
    currency: string;
    opening_balance: number | string;
    closing_balance: number | string;
    outstanding_payable: number | string;
    unallocated_credit: number | string;
    total_purchases: number | string;
    total_payments: number | string;
    total_credit_notes: number | string;
    period_debit: number | string;
    period_credit: number | string;
    transactions_count: number;
    transactions: StatementTransaction[];
}

export interface AgingInvoice {
    invoice_id: string;
    invoice_number: string;
    vendor_invoice_number: string;
    parent_po_number: string;
    document_date: string;
    due_date: string;
    days_overdue: number;
    original_amount: number | string;
    return_credit: number | string;
    net_amount: number | string;
    paid_amount: number | string;
    outstanding_amount: number | string;
    bucket: 'CURRENT' | 'DAYS_1_30' | 'DAYS_31_60' | 'DAYS_61_90' | 'DAYS_OVER_90';
    payment_status: string;
}

export interface VendorAging {
    vendor_id: string;
    vendor_name: string;
    vendor_code: string;
    currency: string;
    as_of_date: string;
    total_outstanding: number | string;
    current: number | string;
    days_1_30: number | string;
    days_31_60: number | string;
    days_61_90: number | string;
    days_over_90: number | string;
    unallocated_credit: number | string;
    open_invoices_count: number;
    invoices: AgingInvoice[];
}

export interface CompanyAPAgingSummary {
    total_outstanding: number | string;
    current: number | string;
    days_1_30: number | string;
    days_31_60: number | string;
    days_61_90: number | string;
    days_over_90: number | string;
    total_unallocated_credit: number | string;
    vendors_count: number;
}

export interface CompanyAPAgingVendorRow {
    vendor_id: string;
    vendor_name: string;
    vendor_code: string;
    currency: string;
    total_outstanding: number | string;
    current: number | string;
    days_1_30: number | string;
    days_31_60: number | string;
    days_61_90: number | string;
    days_over_90: number | string;
    unallocated_credit: number | string;
    open_invoices_count: number;
}

export interface CompanyAPAging {
    as_of_date: string;
    summary: CompanyAPAgingSummary;
    vendors: CompanyAPAgingVendorRow[];
}

export interface VendorReconciliation {
    id: string;
    reconciliation_number: string;
    vendor: string;
    vendor_name?: string;
    vendor_code?: string;
    statement_date: string;
    as_of_date: string;
    vendor_reported_balance: number | string;
    system_balance: number | string;
    variance: number | string;
    status: 'PENDING' | 'MATCHED' | 'VARIANCE' | 'RESOLVED';
    status_display?: string;
    currency: string;
    notes?: string;
    resolution_notes?: string;
    reconciled_by?: string;
    reconciled_by_name?: string;
    reconciled_at?: string;
    resolved_by?: string;
    resolved_by_name?: string;
    resolved_at?: string;
    created_at?: string;
    updated_at?: string;
}

export const getVendorStatement = async (
    vendorId: string,
    params?: { start_date?: string; end_date?: string }
): Promise<VendorStatement> => {
    const res = await api.get(`/api/purchasing/vendors/${vendorId}/statement/`, { params });
    return res.data;
};

export const getVendorAging = async (
    vendorId: string,
    asOfDate?: string
): Promise<VendorAging> => {
    const res = await api.get(`/api/purchasing/vendors/${vendorId}/aging/`, {
        params: asOfDate ? { as_of_date: asOfDate } : undefined
    });
    return res.data;
};

export const getCompanyAPAging = async (params?: {
    as_of_date?: string;
    vendor?: string;
    bucket?: string;
}): Promise<CompanyAPAging> => {
    const res = await api.get('/api/purchasing/vendors/ap_aging/', { params });
    return res.data;
};

export const getVendorReconciliations = async (params?: {
    vendor?: string;
    status?: string;
    search?: string;
}): Promise<VendorReconciliation[]> => {
    const res = await api.get('/api/purchasing/reconciliations/', { params });
    return res.data.results || res.data;
};

export const createVendorReconciliation = async (data: {
    vendor: string;
    statement_date: string;
    as_of_date?: string;
    vendor_reported_balance: number | string;
    notes?: string;
}): Promise<VendorReconciliation> => {
    const res = await api.post('/api/purchasing/reconciliations/', data);
    return res.data;
};

export const resolveVendorReconciliation = async (
    reconciliationId: string,
    resolutionNotes: string
): Promise<VendorReconciliation> => {
    const res = await api.post(`/api/purchasing/reconciliations/${reconciliationId}/resolve/`, {
        resolution_notes: resolutionNotes
    });
    return res.data;
};

// -------------------------------------------------------------
// Phase S-3H: Purchasing Reports, Vendor Performance & Certification
// -------------------------------------------------------------

export interface PurchasingDashboardKPIs {
    open_purchase_orders_count: number;
    open_purchase_orders_value: string;
    pending_approvals_count: number;
    pending_po_approvals_count: number;
    pending_return_approvals_count: number;
    pending_deliveries_count: number;
    partially_received_pos_count: number;
    posted_bills_count: number;
    posted_bills_value: string;
    outstanding_payables: string;
    overdue_payables: string;
    payments_period_count: number;
    payments_period_total: string;
    purchase_returns_count: number;
    purchase_returns_total: string;
    unallocated_vendor_credits: string;
    as_of_date: string;
}

export interface PurchasingReportResult {
    report_type: string;
    rows: any[];
    count: number;
}

export interface VendorPerformanceMetrics {
    vendor_id: string;
    vendor_name: string;
    vendor_code: string;
    category: string;
    manual_rating: string | null;
    total_purchase_value: string;
    number_of_orders: number;
    average_delivery_time_days: number;
    on_time_delivery_pct: number;
    quantity_fulfillment_pct: number;
    return_rate_pct: number;
    invoice_match_rate_pct: number;
    price_variance_count: number;
    outstanding_payable: string;
    unallocated_credit: string;
    last_purchase_date: string | null;
    currency: string;
}

export interface VendorItemComparisonRow {
    vendor_id: string;
    vendor_name: string;
    vendor_code: string;
    manual_rating: string | null;
    latest_purchase_price: string;
    lowest_purchase_price: string;
    average_purchase_price: string;
    latest_order_date: string;
    total_qty_ordered: string;
    total_qty_received: string;
    lead_time_days: number;
    on_time_delivery_pct: number;
    return_rate_pct: number;
    currency: string;
}

export interface VendorItemComparison {
    item_id: string;
    item_name: string;
    sku: string;
    cost_price: string;
    suppliers_count: number;
    vendors: VendorItemComparisonRow[];
}

export interface PurchasingExceptions {
    as_of_date: string;
    summary: {
        overdue_deliveries_count: number;
        match_mismatches_count: number;
        overdue_payables_count: number;
        unallocated_credits_count: number;
        pending_reconciliations_count: number;
        total_exceptions_count: number;
    };
    overdue_deliveries: Array<{
        po_id: string;
        po_number: string;
        vendor_name: string;
        item_name: string;
        pending_quantity: string;
        expected_delivery_date: string;
        days_overdue: number;
    }>;
    match_mismatches: Array<{
        bill_id: string;
        bill_number: string;
        vendor_invoice_number: string;
        vendor_name: string;
        document_date: string;
        total_amount: string;
        issue: string;
    }>;
    overdue_payables: Array<{
        bill_id: string;
        bill_number: string;
        vendor_name: string;
        due_date: string;
        days_overdue: number;
        outstanding_payable: string;
    }>;
    unallocated_credits: Array<{
        credit_note_id: string;
        credit_note_number: string;
        vendor_name: string;
        unallocated_amount: string;
        created_at: string;
    }>;
    pending_reconciliations: Array<{
        reconciliation_id: string;
        reconciliation_number: string;
        vendor_name: string;
        statement_date: string;
        variance: string;
        status: string;
    }>;
}

export interface CRMProcurementDemandItem {
    proposal_id: string;
    proposal_number: string;
    client_name: string;
    contract_code: string;
    demand_id: string;
    item_name: string;
    required_quantity: number;
    location_name: string;
    required_by_date: string;
    charge_type: string;
    estimated_unit_cost: string;
    estimated_total_cost: string;
    status: string;
}

export interface CRMProcurementDemand {
    company_id: string;
    proposals_count: number;
    total_demand_items_count: number;
    procurement_demand: CRMProcurementDemandItem[];
}

export const getPurchasingDashboardKPIs = async (params?: {
    start_date?: string;
    end_date?: string;
}): Promise<PurchasingDashboardKPIs> => {
    const res = await api.get('/api/purchasing/reports/dashboard-kpis/', { params });
    return res.data;
};

export const getPurchasingReportData = async (params: {
    report_type: string;
    start_date?: string;
    end_date?: string;
    vendor?: string;
    item?: string;
    status?: string;
    search?: string;
}): Promise<PurchasingReportResult> => {
    const res = await api.get('/api/purchasing/reports/report-data/', { params });
    return res.data;
};

export const getVendorPerformance = async (vendorId?: string): Promise<VendorPerformanceMetrics | VendorPerformanceMetrics[]> => {
    const res = await api.get('/api/purchasing/reports/vendor-performance/', {
        params: vendorId ? { vendor: vendorId } : undefined
    });
    return res.data;
};

export const getVendorComparison = async (itemId: string): Promise<VendorItemComparison> => {
    const res = await api.get('/api/purchasing/reports/vendor-comparison/', {
        params: { item: itemId }
    });
    return res.data;
};

export const getPurchasingExceptions = async (): Promise<PurchasingExceptions> => {
    const res = await api.get('/api/purchasing/reports/exceptions/');
    return res.data;
};

export const getCRMProcurementDemand = async (proposalId?: string): Promise<CRMProcurementDemand> => {
    const res = await api.get('/api/purchasing/reports/crm-procurement-demand/', {
        params: proposalId ? { proposal: proposalId } : undefined
    });
    return res.data;
};
