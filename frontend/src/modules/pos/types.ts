import type { Item } from '../inventory/types';

// CRM Entity Type based on backend (Minimal for POS needs)
export interface CRMEntity {
    id: string;
    company: string;
    name: string;
    entity_type: string;
}

// Customer Type based on CustomerSerializer
export interface Customer {
    id: string;
    company: string;
    name: string;
    phone: string;
    email: string;
    crm_entity: string | CRMEntity | null;
    balance: string;
    total_credit: string;
    total_paid: string;
    created_at: string;
    updated_at: string;
}

// POS Session based on POSSessionSerializer
export interface POSSession {
    id: string;
    company: string;
    cashier: string;
    opening_cash: string;
    closing_cash: string | null;
    difference: string | null;
    status: 'OPEN' | 'CLOSED';
    start_time: string;
    end_time: string | null;
    created_at: string;
    updated_at: string;
}

// Cart Item (Frontend Specific, maps to SaleItem in backend checkout payload)
export interface CartItem {
    id: string; // Unique ID for the cart line
    item: Item;
    quantity: number;
    unitPrice: number;
}

// Discount configuration matching existing legacy POS capabilities
export interface Discount {
    type: 'percentage' | 'flat';
    value: number;
}

// Payload for POST /api/sales/sales/checkout/
export interface CheckoutLinePayload {
    product?: string;
    item_id?: string;
    quantity: number;
    unit_price: number | string;
}

export interface CheckoutPayload {
    subtotal: number | string;
    tax_amount: number | string;
    discount_amount: number | string;
    total_amount: number | string;
    received_amount: number | string;
    payment_method: 'cash' | 'card' | 'credit' | 'split';
    customer?: string | null;
    crm_entity?: string | null;
    split_cash?: number | string;
    split_card?: number | string;
    lines: CheckoutLinePayload[];
}

export interface CheckoutResponse {
    id: string;
    status: string;
    subtotal: string;
    tax_amount: string;
    discount_amount: string;
    total_amount: string;
    received_amount: string;
    payment_method: string;
    split_cash: string | null;
    split_card: string | null;
    profit: string;
    created_at: string;
    cashier: string;
    customer_info: Customer | null;
    items: {
        id: string;
        product_name: string;
        quantity: string;
        unit_price: string;
        line_total: string;
    }[];
}
