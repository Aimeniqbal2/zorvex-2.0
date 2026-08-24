import { apiClient } from '../../api/client';
import type {
    PaginatedResponse,
    Category,
    CreateCategoryPayload,
    Product,
    CreateProductPayload,
    UpdateProductPayload,
    ProductListParams,
    InventoryKpis,
    Item,
    CreateItemPayload,
    UpdateItemPayload,
    ItemListParams,
    ItemFieldDefinition
} from './types';

const BASE_URL = '/api/inventory';

// ==========================================
// Category API
// ==========================================

export const getCategories = async (): Promise<Category[]> => {
    // Note: The DRF ViewSet for Category may be paginated or not, but typically categories are small enough.
    // If it is paginated, we should return PaginatedResponse<Category>. Let's type it as handling both.
    const response = await apiClient.get(`${BASE_URL}/categorys/`);
    
    // Auto-unwrap paginated responses for categories if backend uses pagination
    if (response.data && typeof response.data.count === 'number' && Array.isArray(response.data.results)) {
        return response.data.results;
    }
    
    return response.data;
};

export const createCategory = async (payload: CreateCategoryPayload): Promise<Category> => {
    const response = await apiClient.post(`${BASE_URL}/categorys/`, payload);
    return response.data;
};

// ==========================================
// Product API
// ==========================================

export const getProducts = async (params?: ProductListParams): Promise<PaginatedResponse<Product>> => {
    const response = await apiClient.get(`${BASE_URL}/products/`, { params });
    if (Array.isArray(response.data)) {
        return {
            count: response.data.length,
            next: null,
            previous: null,
            results: response.data
        };
    }
    return response.data;
};

export const getProduct = async (id: string): Promise<Product> => {
    const response = await apiClient.get(`${BASE_URL}/products/${id}/`);
    return response.data;
};

export const createProduct = async (payload: CreateProductPayload): Promise<Product> => {
    const response = await apiClient.post(`${BASE_URL}/products/`, payload);
    return response.data;
};

export const updateProduct = async (id: string, payload: UpdateProductPayload): Promise<Product> => {
    const response = await apiClient.patch(`${BASE_URL}/products/${id}/`, payload);
    return response.data;
};

export const deleteProduct = async (id: string): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/products/${id}/`);
};

// ==========================================
// KPI API
// ==========================================

export const getInventoryKpis = async (): Promise<InventoryKpis> => {
    const response = await apiClient.get(`${BASE_URL}/products/kpis/`);
    return response.data;
};

// ==========================================
// Item API (Universal Inventory)
// ==========================================

export const getItems = async (params?: ItemListParams): Promise<PaginatedResponse<Item>> => {
    const response = await apiClient.get(`${BASE_URL}/items/`, { params });
    if (Array.isArray(response.data)) {
        return {
            count: response.data.length,
            next: null,
            previous: null,
            results: response.data
        };
    }
    return response.data;
};

export const createItem = async (payload: CreateItemPayload): Promise<Item> => {
    const response = await apiClient.post(`${BASE_URL}/items/`, payload);
    return response.data;
};

export const updateItem = async (id: string, payload: UpdateItemPayload): Promise<Item> => {
    const response = await apiClient.patch(`${BASE_URL}/items/${id}/`, payload);
    return response.data;
};

export const deleteItem = async (id: string): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/items/${id}/`);
};

export const setOpeningStock = async (itemId: string, warehouseId: string, quantity: number): Promise<void> => {
    await apiClient.post(`${BASE_URL}/items/${itemId}/opening_stock/`, {
        warehouse_id: warehouseId,
        quantity: quantity,
    });
};

export const getItemFieldDefinitions = async (categoryId?: string, params: any = { active: 'true' }): Promise<ItemFieldDefinition[]> => {
    if (categoryId) {
        params.category = categoryId;
    }
    const response = await apiClient.get(`${BASE_URL}/item-field-definitions/`, { params });
    if (response.data && typeof response.data.count === 'number' && Array.isArray(response.data.results)) {
        return response.data.results;
    }
    return response.data;
};

export const createItemFieldDefinition = async (payload: Partial<ItemFieldDefinition>): Promise<ItemFieldDefinition> => {
    const response = await apiClient.post(`${BASE_URL}/item-field-definitions/`, payload);
    return response.data;
};

export const updateItemFieldDefinition = async (id: string, payload: Partial<ItemFieldDefinition>): Promise<ItemFieldDefinition> => {
    const response = await apiClient.patch(`${BASE_URL}/item-field-definitions/${id}/`, payload);
    return response.data;
};

export const deleteItemFieldDefinition = async (id: string): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/item-field-definitions/${id}/`);
};

// ==========================================
// Warehouse API (from platform_core)
// ==========================================
import type { Warehouse } from './types';

export const getWarehouses = async (): Promise<Warehouse[]> => {
    const response = await apiClient.get('/api/platform/warehouses/');
    if (response.data && typeof response.data.count === 'number' && Array.isArray(response.data.results)) {
        return response.data.results;
    }
    return response.data;
};
