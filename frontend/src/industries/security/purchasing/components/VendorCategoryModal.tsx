import React, { useState, useEffect } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import {
    getVendorCategories,
    createVendorCategory,
    updateVendorCategory,
    deleteVendorCategory,
    seedDefaultVendorCategories,
    extractApiError,
    type VendorCategory
} from '../api';

interface VendorCategoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCategoriesUpdated?: () => void;
}

export const VendorCategoryModal: React.FC<VendorCategoryModalProps> = ({
    isOpen,
    onClose,
    onCategoriesUpdated
}) => {
    const [categories, setCategories] = useState<VendorCategory[]>([]);
    const [loading, setLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [editingCategory, setEditingCategory] = useState<VendorCategory | null>(null);
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [description, setDescription] = useState('');

    useEffect(() => {
        if (isOpen) {
            loadCategories();
            resetForm();
        }
    }, [isOpen]);

    const loadCategories = async () => {
        setLoading(true);
        try {
            const data = await getVendorCategories();
            setCategories(data || []);
        } catch (err: any) {
            useToastStore.getState().error(extractApiError(err, 'Failed to load vendor categories.'));
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setEditingCategory(null);
        setName('');
        setCode('');
        setDescription('');
    };

    const handleEdit = (cat: VendorCategory) => {
        setEditingCategory(cat);
        setName(cat.name);
        setCode(cat.code || '');
        setDescription(cat.description || '');
    };

    const handleDelete = async (cat: VendorCategory) => {
        if (!window.confirm(`Are you sure you want to delete category "${cat.name}"?`)) return;
        try {
            await deleteVendorCategory(cat.id);
            useToastStore.getState().success(`Category "${cat.name}" deleted.`);
            await loadCategories();
            onCategoriesUpdated?.();
        } catch (err: any) {
            useToastStore.getState().error(extractApiError(err, 'Failed to delete category.'));
        }
    };

    const handleSeedDefaults = async () => {
        try {
            setLoading(true);
            await seedDefaultVendorCategories();
            useToastStore.getState().success('Default security vendor categories generated.');
            await loadCategories();
            onCategoriesUpdated?.();
        } catch (err: any) {
            useToastStore.getState().error(extractApiError(err, 'Failed to seed categories.'));
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            useToastStore.getState().error('Category name is required.');
            return;
        }

        setIsSaving(true);
        try {
            if (editingCategory) {
                await updateVendorCategory(editingCategory.id, {
                    name: name.trim(),
                    code: code.trim(),
                    description: description.trim()
                });
                useToastStore.getState().success(`Category "${name}" updated.`);
            } else {
                await createVendorCategory({
                    name: name.trim(),
                    code: code.trim(),
                    description: description.trim()
                });
                useToastStore.getState().success(`Category "${name}" created.`);
            }
            resetForm();
            await loadCategories();
            onCategoriesUpdated?.();
        } catch (err: any) {
            useToastStore.getState().error(extractApiError(err, 'Failed to save vendor category.'));
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Manage Security Vendor Categories"
            size="large"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '78vh', overflowY: 'auto', paddingRight: '4px' }}>
                
                {/* Form to Add / Edit */}
                <form onSubmit={handleSubmit} style={{
                    background: 'var(--color-surface-secondary, #f8fafc)',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    borderRadius: '10px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text, #1e293b)' }}>
                            {editingCategory ? `Edit Category: ${editingCategory.name}` : '+ Add New Vendor Category'}
                        </div>
                        {editingCategory && (
                            <Button type="button" variant="secondary" onClick={resetForm} style={{ padding: '4px 10px', fontSize: '12px' }}>
                                Cancel Edit
                            </Button>
                        )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '12px' }}>
                        <div>
                            <Input
                                label="Category Name *"
                                placeholder="e.g. Uniforms & Apparel, Armory & Weapons, CCTV"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <Input
                                label="Category Code (Optional)"
                                placeholder="e.g. UNIFORM, WEAPONS, COMMS"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted, #64748b)', fontWeight: 600, marginBottom: '4px' }}>
                            Description & Items Covered
                        </label>
                        <Input
                            placeholder="e.g. Tactical uniforms, boots, security belts, peaked caps, raincoats..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                        <Button type="submit" variant="primary" disabled={isSaving}>
                            <i className="bx bx-check"></i> {editingCategory ? 'Update Category' : 'Save Category'}
                        </Button>
                    </div>
                </form>

                {/* Categories Table */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted, #64748b)' }}>
                            Active Vendor Categories ({categories.length})
                        </div>
                        {categories.length === 0 && (
                            <Button type="button" variant="secondary" onClick={handleSeedDefaults} disabled={loading} style={{ fontSize: '12px' }}>
                                <i className="bx bx-magic-wand"></i> Seed Default Categories
                            </Button>
                        )}
                    </div>

                    {loading ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-muted, #64748b)', fontSize: '13px' }}>
                            Loading categories...
                        </div>
                    ) : categories.length === 0 ? (
                        <div style={{
                            padding: '32px',
                            textAlign: 'center',
                            background: 'var(--color-surface, #ffffff)',
                            border: '1px dashed var(--color-border, #cbd5e1)',
                            borderRadius: '8px'
                        }}>
                            <p style={{ margin: '0 0 12px', color: 'var(--color-text-muted, #64748b)', fontSize: '13px' }}>
                                No vendor categories found. Create a category above or click below to populate standard security industry categories.
                            </p>
                            <Button type="button" variant="primary" onClick={handleSeedDefaults}>
                                <i className="bx bx-magic-wand"></i> Populate Default Security Categories
                            </Button>
                        </div>
                    ) : (
                        <div style={{ border: '1px solid var(--color-border, #e2e8f0)', borderRadius: '8px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                <thead style={{ background: 'var(--color-surface-secondary, #f8fafc)', borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                                    <tr>
                                        <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--color-text-muted, #64748b)' }}>Category Name</th>
                                        <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--color-text-muted, #64748b)' }}>Code</th>
                                        <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--color-text-muted, #64748b)' }}>Description</th>
                                        <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--color-text-muted, #64748b)', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {categories.map((cat, idx) => (
                                        <tr key={cat.id} style={{ borderBottom: idx < categories.length - 1 ? '1px solid var(--color-border, #f1f5f9)' : 'none' }}>
                                            <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--color-text, #1e293b)' }}>
                                                {cat.name}
                                            </td>
                                            <td style={{ padding: '10px 14px', color: 'var(--color-text-muted, #64748b)', fontFamily: 'monospace' }}>
                                                {cat.code || '—'}
                                            </td>
                                            <td style={{ padding: '10px 14px', color: 'var(--color-text-muted, #64748b)', maxWidth: '300px' }}>
                                                {cat.description || '—'}
                                            </td>
                                            <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    onClick={() => handleEdit(cat)}
                                                    style={{ padding: '4px 8px', fontSize: '11px', marginRight: '6px' }}
                                                >
                                                    <i className="bx bx-edit"></i> Edit
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    onClick={() => handleDelete(cat)}
                                                    style={{ padding: '4px 8px', fontSize: '11px', color: '#ef4444' }}
                                                >
                                                    <i className="bx bx-trash"></i>
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

