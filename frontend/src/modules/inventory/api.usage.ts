import type { Product, Category, InventoryKpis } from './types';
import { getCategories, createCategory, getProducts, getProduct, createProduct, updateProduct, deleteProduct, getInventoryKpis } from './api';

// This file exists merely to provide a compile-time assertion that the API surface matches the specifications
export const testApiTypings = async () => {
    // 1. Category
    const categories: Category[] = await getCategories();
    const newCategory: Category = await createCategory({
        name: 'Hardware',
        description: 'New hardware'
    });

    // 2. Product
    const productsResponse = await getProducts({
        page: 1,
        page_size: 10,
        search: 'Laptop'
    });
    const products: Product[] = productsResponse.results;
    const count: number = productsResponse.count;

    const singleProduct: Product = await getProduct('uuid-str');

    const createdProduct: Product = await createProduct({
        brand: 'Dell',
        model_name: 'XPS',
    });

    const updatedProduct: Product = await updateProduct('uuid-str', {
        low_stock_threshold: 5
    });

    await deleteProduct('uuid-str');

    // 3. KPIs
    const kpis: InventoryKpis = await getInventoryKpis();
    const activeSkus: number = kpis.total_active_skus;
    const assetValue: number = kpis.calculated_asset_value;
    const shortages: number = kpis.hardware_shortages;

    return {
        categories,
        newCategory,
        products,
        count,
        singleProduct,
        createdProduct,
        updatedProduct,
        activeSkus,
        assetValue,
        shortages
    };
};
