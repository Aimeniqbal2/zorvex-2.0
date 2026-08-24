import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { createItem, updateItem, getCategories, getWarehouses, setOpeningStock } from '../api';
import type { Item, Category, Warehouse, CreateItemPayload, UpdateItemPayload } from '../types';
import { useToastStore } from '../../../stores/toastStore';
import { DynamicCustomFields } from './DynamicCustomFields';

interface ItemModalProps {
    item: Item | null;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const ItemModal: React.FC<ItemModalProps> = ({ item, isOpen, onClose, onSuccess }) => {
    const isEdit = !!item;
    
    const [categories, setCategories] = useState<Category[]>([]);
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    
    const [formData, setFormData] = useState<Partial<Item>>({});
    const [openingStockQuantity, setOpeningStockQuantity] = useState<number>(0);
    const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const { success, error } = useToastStore();

    useEffect(() => {
        if (isOpen) {
            getCategories().then(setCategories).catch(() => {});
            getWarehouses().then(setWarehouses).catch(() => {});
            
            if (isEdit && item) {
                setFormData(item);
            } else {
                setFormData({
                    name: '',
                    item_type: 'PRODUCT',
                    category: '',
                    sku: '',
                    item_code: '',
                    barcode: '',
                    brand: '',
                    unit_of_measure: 'pcs',
                    description: '',
                    cost_price: '',
                    selling_price: '',
                    minimum_stock_level: '0',
                    reorder_level: '0',
                    track_inventory: true,
                    track_serial_number: false,
                    track_batch: false,
                    is_sellable: true,
                    is_purchasable: true,
                    is_active: true,
                    custom_fields: {}
                });
                setOpeningStockQuantity(0);
                setSelectedWarehouse('');
            }
        }
    }, [isOpen, isEdit, item]);

    const handleChange = (field: keyof Item, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleCustomFieldsChange = (customFields: Record<string, any>) => {
        setFormData(prev => ({ ...prev, custom_fields: customFields }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.name || !formData.item_type) return;

        setIsSubmitting(true);
        try {
            if (isEdit && item) {
                await updateItem(item.id, formData as UpdateItemPayload);
                success('Item updated successfully');
            } else {
                if (formData.track_inventory && openingStockQuantity > 0 && !selectedWarehouse) {
                    error("Warehouse selection is required for opening stock.");
                    setIsSubmitting(false);
                    return;
                }
                const newItem = await createItem(formData as CreateItemPayload);
                
                if (formData.track_inventory && openingStockQuantity > 0) {
                    try {
                        await setOpeningStock(newItem.id, selectedWarehouse, openingStockQuantity);
                    } catch (stockErr) {
                        error('Item created, but failed to set opening stock');
                    }
                }
                success('Item created successfully');
            }
            onSuccess();
            onClose();
        } catch (err) {
            error(`Failed to ${isEdit ? 'update' : 'create'} item`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={isEdit ? "Edit Item" : "New Universal Item"}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button variant="primary" onClick={handleSubmit} loading={isSubmitting}>
                        {isEdit ? "Save Changes" : "Create Item"}
                    </Button>
                </>
            }
        >
            <form onSubmit={handleSubmit} className="modal-form">
                
                {/* 1. Basic Information */}
                <h4 style={{ margin: '16px 0 8px 0', color: 'var(--color-primary)' }}>Basic Information</h4>
                
                <div className="form-row">
                    <Input 
                        label="Item Name *" 
                        value={formData.name || ''} 
                        onChange={e => handleChange('name', e.target.value)} 
                        required 
                    />
                    <div className="form-field">
                        <label className="form-label">Item Type *</label>
                        <select 
                            className="input-base" 
                            value={formData.item_type || 'PRODUCT'} 
                            onChange={e => handleChange('item_type', e.target.value)}
                            required
                        >
                            <option value="PRODUCT">Product</option>
                            <option value="SERVICE">Service</option>
                            <option value="SPARE_PART">Spare Part</option>
                            <option value="CONSUMABLE">Consumable</option>
                            <option value="ASSET">Asset</option>
                            <option value="EQUIPMENT">Equipment</option>
                            <option value="RENTAL">Rental</option>
                            <option value="DIGITAL">Digital</option>
                            <option value="BUNDLE">Bundle</option>
                        </select>
                    </div>
                </div>
                
                <div className="form-row">
                    <div className="form-field">
                        <label className="form-label">Category</label>
                        <select 
                            className="input-base" 
                            value={formData.category || ''} 
                            onChange={e => handleChange('category', e.target.value)}
                        >
                            <option value="">-- Select Category --</option>
                            {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </select>
                    </div>
                    <Input 
                        label="SKU" 
                        value={formData.sku || ''} 
                        onChange={e => handleChange('sku', e.target.value)} 
                    />
                </div>

                <div className="form-row">
                    <Input 
                        label="Item Code" 
                        value={formData.item_code || ''} 
                        onChange={e => handleChange('item_code', e.target.value)} 
                    />
                    <Input 
                        label="Barcode" 
                        value={formData.barcode || ''} 
                        onChange={e => handleChange('barcode', e.target.value)} 
                    />
                </div>

                <div className="form-row">
                    <Input 
                        label="Brand (Optional)" 
                        value={formData.brand || ''} 
                        onChange={e => handleChange('brand', e.target.value)} 
                    />
                    <Input 
                        label="Unit of Measure" 
                        value={formData.unit_of_measure || ''} 
                        onChange={e => handleChange('unit_of_measure', e.target.value)} 
                    />
                </div>

                <div className="form-row" style={{ gridTemplateColumns: '1fr' }}>
                    <div className="form-field">
                        <label className="form-label">Description</label>
                        <textarea
                            className="input-base"
                            value={formData.description || ''}
                            onChange={e => handleChange('description', e.target.value)}
                            rows={3}
                        />
                    </div>
                </div>

                {/* Dynamic Custom Fields */}
                <DynamicCustomFields 
                    categoryId={formData.category} 
                    values={formData.custom_fields || formData.custom_attributes || {}} 
                    onChange={handleCustomFieldsChange} 
                />

                {/* 2. Pricing */}
                <h4 style={{ margin: '24px 0 8px 0', color: 'var(--color-primary)' }}>Pricing</h4>
                <div className="form-row">
                    <Input 
                        label="Cost Price" 
                        type="number"
                        step="0.01"
                        value={formData.cost_price || ''} 
                        onChange={e => handleChange('cost_price', e.target.value)} 
                    />
                    <Input 
                        label="Selling Price" 
                        type="number"
                        step="0.01"
                        value={formData.selling_price || ''} 
                        onChange={e => handleChange('selling_price', e.target.value)} 
                    />
                </div>

                {/* 3. Inventory Control */}
                <h4 style={{ margin: '24px 0 8px 0', color: 'var(--color-primary)' }}>Inventory Control</h4>
                <div className="form-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input type="checkbox" checked={formData.track_inventory} onChange={e => handleChange('track_inventory', e.target.checked)} />
                        Track Inventory
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input type="checkbox" checked={formData.track_serial_number} onChange={e => handleChange('track_serial_number', e.target.checked)} />
                        Track Serial Number
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input type="checkbox" checked={formData.track_batch} onChange={e => handleChange('track_batch', e.target.checked)} />
                        Track Batch
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input type="checkbox" checked={formData.is_sellable} onChange={e => handleChange('is_sellable', e.target.checked)} />
                        Sellable
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input type="checkbox" checked={formData.is_purchasable} onChange={e => handleChange('is_purchasable', e.target.checked)} />
                        Purchasable
                    </label>
                </div>

                {/* 4. Reorder */}
                <h4 style={{ margin: '24px 0 8px 0', color: 'var(--color-primary)' }}>Reorder Levels</h4>
                <div className="form-row">
                    <Input 
                        label="Minimum Stock Level" 
                        type="number"
                        step="0.01"
                        value={formData.minimum_stock_level || ''} 
                        onChange={e => handleChange('minimum_stock_level', e.target.value)} 
                    />
                    <Input 
                        label="Reorder Level" 
                        type="number"
                        step="0.01"
                        value={formData.reorder_level || ''} 
                        onChange={e => handleChange('reorder_level', e.target.value)} 
                    />
                </div>

                {/* 5. Opening Stock (Create only) */}
                {!isEdit && formData.track_inventory && (
                    <>
                        <h4 style={{ margin: '24px 0 8px 0', color: 'var(--color-primary)' }}>Opening Stock</h4>
                        <div className="form-row">
                            <Input 
                                label="Opening Stock Quantity" 
                                type="number"
                                step="0.01"
                                min="0"
                                value={openingStockQuantity} 
                                onChange={e => setOpeningStockQuantity(parseFloat(e.target.value) || 0)} 
                            />
                            <div className="form-field">
                                <label className="form-label">Warehouse {openingStockQuantity > 0 && '*'}</label>
                                <select 
                                    className="input-base" 
                                    value={selectedWarehouse} 
                                    onChange={e => setSelectedWarehouse(e.target.value)}
                                    required={openingStockQuantity > 0}
                                >
                                    <option value="">-- Select Warehouse --</option>
                                    {warehouses.map(wh => (
                                        <option key={wh.id} value={wh.id}>{wh.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </>
                )}

            </form>
        </Modal>
    );
};
