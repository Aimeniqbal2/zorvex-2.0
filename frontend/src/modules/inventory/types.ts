export interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

export interface Category {
    id: string; // Assuming UUIDs, adjust to number if it's integer IDs in Django
    name: string;
    description: string;
}

export interface CreateCategoryPayload {
    name: string;
    description?: string;
}

export interface Product {
    id: string;
    category: string | null;
    category_name: string;
    brand: string;
    model_name: string;
    color: string;
    storage_capacity: string;
    barcode: string;
    issues: string;
    cost_price: string; // Django DecimalField is serialized as a string
    sale_price: string;
    service_price: string;
    commission: string;
    price: string; // Backwards compatibility property
    stock_quantity: number; // Sum outputs can sometimes be numbers, but we'll use number for now unless specified
    low_stock_threshold: number;
    profit_per_unit: string;
    is_low_stock: boolean;
}

export interface CreateProductPayload {
    category?: string | null;
    brand: string;
    model_name: string;
    color?: string;
    storage_capacity?: string;
    barcode?: string;
    issues?: string;
    cost_price?: string;
    sale_price?: string;
    service_price?: string;
    commission?: string;
    low_stock_threshold?: number;
}

export interface UpdateProductPayload {
    category?: string | null;
    brand?: string;
    model_name?: string;
    color?: string;
    storage_capacity?: string;
    barcode?: string;
    issues?: string;
    cost_price?: string;
    sale_price?: string;
    service_price?: string;
    commission?: string;
    low_stock_threshold?: number;
}

export interface ProductListParams {
    page?: number;
    page_size?: number;
    search?: string;
    ordering?: string; // Standard Django REST framework ordering param
}

export interface Item {
    id: string;
    item_type: 'PRODUCT' | 'SERVICE' | 'SPARE_PART' | 'CONSUMABLE' | 'ASSET' | 'EQUIPMENT' | 'RENTAL' | 'DIGITAL' | 'BUNDLE';
    sku: string;
    item_code: string;
    barcode: string;
    name: string;
    description: string;
    category: string | null;
    category_name?: string;
    brand: string;
    unit_of_measure: string;
    is_active: boolean;
    is_sellable: boolean;
    is_purchasable: boolean;
    track_inventory: boolean;
    track_serial_number: boolean;
    track_batch: boolean;
    cost_price: string;
    selling_price: string;
    minimum_stock_level: string;
    reorder_level: string;
    current_stock?: string;
    custom_fields?: Record<string, any>;
    custom_attributes?: Record<string, any>;
}

export type ItemFieldType =
    | 'TEXT'
    | 'TEXTAREA'
    | 'NUMBER'
    | 'DECIMAL'
    | 'BOOLEAN'
    | 'DATE'
    | 'DATETIME'
    | 'SELECT'
    | 'MULTI_SELECT';

export interface ItemFieldDefinition {
    id: string;
    category: string | null;
    name: string;
    key: string;
    field_type: ItemFieldType;
    description: string;
    required: boolean;
    active: boolean;
    sort_order: number;
    options?: any;
    default_value?: any;
}

export interface Warehouse {
    id: string;
    name: string;
}

export interface CreateItemPayload extends Partial<Omit<Item, 'id' | 'category_name'>> {}

export interface UpdateItemPayload extends Partial<Omit<Item, 'id' | 'category_name'>> {}

export interface ItemListParams {
    page?: number;
    page_size?: number;
    search?: string;
    ordering?: string;
    category?: string;
    is_active?: boolean | string;
    is_sellable?: boolean | string;
}

export interface InventoryKpis {
    total_active_skus: number;
    calculated_asset_value: number; // Returning as float as specified in backend
    hardware_shortages: number;
}
