import React, { useState, useEffect, useCallback } from 'react';
import { InventoryKpis } from './components/InventoryKpis';
import { CategoryModal } from './components/CategoryModal';
import { ItemModal } from './components/ItemModal';
import { DeleteItemModal } from './components/DeleteItemModal';
import { CustomFieldSettingsModal } from './components/CustomFieldSettingsModal';
import { DataTable } from '../../components/tables/DataTable';
import type { Column } from '../../components/tables/DataTable';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { ErrorState } from '../../components/ui/ErrorState';
import { getItems } from './api';
import type { Item, PaginatedResponse } from './types';
import { isAxiosError } from 'axios';
import './styles/inventory.css';

export const InventoryModule: React.FC = () => {
    // Workspace Persistent State
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    
    // Data State
    const [data, setData] = useState<PaginatedResponse<Item> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Modal State
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [isCustomFieldsModalOpen, setIsCustomFieldsModalOpen] = useState(false);
    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    const [itemToEdit, setItemToEdit] = useState<Item | null>(null);
    const [itemToDelete, setItemToDelete] = useState<Item | null>(null);

    // Debounce search
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            setPage(1); // Reset page on new search
        }, 400);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    // Fetch Items
    const fetchItems = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const response = await getItems({
                page,
                search: debouncedSearch
            });
            setData(response);
        } catch (err) {
            if (isAxiosError(err) && err.response?.status === 404 && page > 1) {
                // If page is out of bounds
                setPage(p => p - 1);
            } else {
                setHasError(true);
            }
        } finally {
            setIsLoading(false);
        }
    }, [page, debouncedSearch, refreshTrigger]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const handleRefresh = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    const handleEditItem = (item: Item) => {
        setItemToEdit(item);
        setIsItemModalOpen(true);
    };

    const handleDeleteClick = (item: Item) => {
        setItemToDelete(item);
    };

    const handleAddItem = () => {
        setItemToEdit(null);
        setIsItemModalOpen(true);
    };

    const columns: Column<Item>[] = [
        { 
            key: 'name', 
            header: 'Item',
            render: (row) => (
                <div>
                    <strong>{row.name}</strong>
                    {row.description && <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{row.description.substring(0, 50)}{row.description.length > 50 ? '...' : ''}</div>}
                </div>
            )
        },
        { key: 'item_type', header: 'Type' },
        { key: 'category_name', header: 'Category', render: (row) => row.category_name || '-' },
        { key: 'sku', header: 'SKU / Item Code', render: (row) => row.sku || row.item_code || '-' },
        { key: 'barcode', header: 'Barcode', render: (row) => row.barcode || '-' },
        { key: 'unit_of_measure', header: 'Unit' },
        { key: 'cost_price', header: 'Cost' },
        { key: 'selling_price', header: 'Selling Price' },
        { 
            key: 'stock', 
            header: 'Stock', 
            render: (row) => {
                if (!row.track_inventory) {
                    return <span style={{ color: 'var(--color-text-muted)' }}>N/A</span>;
                }
                const stock = parseFloat(row.current_stock || '0');
                const reorderLevel = parseFloat(row.reorder_level || '0');
                const isLowStock = stock <= reorderLevel;

                if (stock <= 0) {
                    return <Badge variant="danger">{stock} {row.unit_of_measure}</Badge>;
                } else if (isLowStock) {
                    return <Badge variant="warning">{stock} {row.unit_of_measure}</Badge>;
                }

                return <span>{stock} {row.unit_of_measure}</span>;
            }
        },
        { 
            key: 'is_active', 
            header: 'Status',
            render: (row) => row.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>
        },
        {
            key: 'actions',
            header: '',
            render: (row) => (
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <Button variant="ghost" icon="bx-edit" onClick={() => handleEditItem(row)} />
                    <Button variant="ghost" icon="bx-trash" onClick={() => handleDeleteClick(row)} style={{ color: 'var(--color-danger)' }} />
                </div>
            )
        }
    ];

    if (hasError && !data) {
        return <ErrorState message="Failed to load inventory data." onRetry={handleRefresh} />;
    }

    return (
        <div className="inventory-module">
            <div className="inventory-header">
                <h1>Inventory</h1>
                <p>Manage products, stock and categories</p>
            </div>

            <div className="inventory-content">
                {/* KPIs */}
                <InventoryKpis key={`kpi-${refreshTrigger}`} />

                {/* Toolbar */}
                <div className="inventory-toolbar">
                    <div className="toolbar-left">
                        <Input 
                            placeholder="Search items..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ width: '100%', minWidth: '250px' }}
                        />
                    </div>
                    <div className="toolbar-right">
                        <Button variant="secondary" icon="bx-cog" onClick={() => setIsCustomFieldsModalOpen(true)}>
                            Custom Fields
                        </Button>
                        <Button variant="secondary" icon="bx-folder-plus" onClick={() => setIsCategoryModalOpen(true)}>
                            Category
                        </Button>
                        <Button variant="primary" icon="bx-plus" onClick={handleAddItem}>
                            Add Item
                        </Button>
                    </div>
                </div>

                {/* Table */}
                <div className="inventory-table-container">
                    <DataTable<Item> 
                        data={data?.results || []}
                        columns={columns}
                        isLoading={isLoading}
                        keyExtractor={(row) => row.id}
                        emptyMessage={searchQuery ? "No items match your search." : "No items yet. Add your first item to start managing inventory."}
                        pagination={data ? {
                            page: page,
                            pageSize: 10,
                            totalItems: data.count,
                            onPageChange: (newPage) => setPage(newPage)
                        } : undefined}
                    />
                </div>
            </div>

            {/* Modals */}
            <CategoryModal 
                isOpen={isCategoryModalOpen} 
                onClose={() => setIsCategoryModalOpen(false)} 
                onSuccess={handleRefresh}
            />

            <CustomFieldSettingsModal
                isOpen={isCustomFieldsModalOpen}
                onClose={() => setIsCustomFieldsModalOpen(false)}
            />
            
            <ItemModal 
                item={itemToEdit}
                isOpen={isItemModalOpen} 
                onClose={() => setIsItemModalOpen(false)} 
                onSuccess={handleRefresh}
            />

            <DeleteItemModal
                item={itemToDelete}
                onClose={() => setItemToDelete(null)}
                onSuccess={handleRefresh}
            />
        </div>
    );
};
