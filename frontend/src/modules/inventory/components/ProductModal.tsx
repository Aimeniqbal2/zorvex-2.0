import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { createProduct, updateProduct, getCategories } from '../api';
import type { Product, Category, CreateProductPayload, UpdateProductPayload } from '../types';
import { useToastStore } from '../../../stores/toastStore';

interface ProductModalProps {
    product: Product | null;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({ product, isOpen, onClose, onSuccess }) => {
    const isEdit = !!product;
    
    const [categories, setCategories] = useState<Category[]>([]);
    
    const [formData, setFormData] = useState<Partial<Product>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { success, error } = useToastStore();

    useEffect(() => {
        if (isOpen) {
            getCategories().then(setCategories).catch(() => {});
            
            if (isEdit && product) {
                setFormData(product);
            } else {
                setFormData({
                    brand: '',
                    model_name: '',
                    category: '',
                    color: '',
                    storage_capacity: '',
                    barcode: '',
                    cost_price: '',
                    sale_price: '',
                    low_stock_threshold: 5
                });
            }
        }
    }, [isOpen, isEdit, product]);

    const handleChange = (field: keyof Product, value: string | number) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.brand || !formData.model_name) return;

        setIsSubmitting(true);
        try {
            if (isEdit && product) {
                await updateProduct(product.id, formData as UpdateProductPayload);
                success('Product updated successfully');
            } else {
                await createProduct(formData as CreateProductPayload);
                success('Product created successfully');
            }
            onSuccess();
            onClose();
        } catch (err) {
            error(`Failed to ${isEdit ? 'update' : 'create'} product`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={isEdit ? "Edit Product" : "New Product"}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button variant="primary" onClick={handleSubmit} loading={isSubmitting}>
                        {isEdit ? "Save Changes" : "Create Product"}
                    </Button>
                </>
            }
        >
            <form onSubmit={handleSubmit} className="modal-form">
                <div className="form-row">
                    <Input 
                        label="Brand" 
                        value={formData.brand || ''} 
                        onChange={e => handleChange('brand', e.target.value)} 
                        required 
                    />
                    <Input 
                        label="Model Name" 
                        value={formData.model_name || ''} 
                        onChange={e => handleChange('model_name', e.target.value)} 
                        required 
                    />
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
                        label="Barcode" 
                        value={formData.barcode || ''} 
                        onChange={e => handleChange('barcode', e.target.value)} 
                    />
                </div>

                <div className="form-row">
                    <Input 
                        label="Color" 
                        value={formData.color || ''} 
                        onChange={e => handleChange('color', e.target.value)} 
                    />
                    <Input 
                        label="Storage Capacity" 
                        value={formData.storage_capacity || ''} 
                        onChange={e => handleChange('storage_capacity', e.target.value)} 
                    />
                </div>

                <div className="form-row">
                    <Input 
                        label="Cost Price" 
                        type="number"
                        step="0.01"
                        value={formData.cost_price || ''} 
                        onChange={e => handleChange('cost_price', e.target.value)} 
                    />
                    <Input 
                        label="Sale Price" 
                        type="number"
                        step="0.01"
                        value={formData.sale_price || ''} 
                        onChange={e => handleChange('sale_price', e.target.value)} 
                    />
                </div>

                <div className="form-row">
                    <Input 
                        label="Low Stock Threshold" 
                        type="number"
                        value={formData.low_stock_threshold || ''} 
                        onChange={e => handleChange('low_stock_threshold', Number(e.target.value))} 
                    />
                </div>
            </form>
        </Modal>
    );
};
