import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { createItemFieldDefinition, updateItemFieldDefinition, getCategories } from '../api';
import type { ItemFieldDefinition, Category } from '../types';
import { useToastStore } from '../../../stores/toastStore';
import '../styles/inventory.css';

interface CustomFieldFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    field?: ItemFieldDefinition | null;
}

export const CustomFieldFormModal: React.FC<CustomFieldFormModalProps> = ({ isOpen, onClose, onSuccess, field }) => {
    const [name, setName] = useState('');
    const [key, setKey] = useState('');
    const [fieldType, setFieldType] = useState('TEXT');
    const [categoryId, setCategoryId] = useState<string | null>(null);
    const [required, setRequired] = useState(false);
    const [active, setActive] = useState(true);
    const [sortOrder, setSortOrder] = useState(0);
    const [description, setDescription] = useState('');
    const [defaultValue, setDefaultValue] = useState<string>('');
    const [options, setOptions] = useState<string[]>([]);
    
    const [categories, setCategories] = useState<Category[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const { success, error } = useToastStore();

    useEffect(() => {
        if (isOpen) {
            getCategories().then(setCategories).catch(console.error);
            
            if (field) {
                setName(field.name);
                setKey(field.key);
                setFieldType(field.field_type);
                setCategoryId(field.category as unknown as string || null); // Assuming field.category is string ID, but API might return ID.
                setRequired(field.required);
                setActive(field.active);
                setSortOrder(field.sort_order);
                setDescription(field.description || '');
                setDefaultValue(field.default_value !== null ? String(field.default_value) : '');
                setOptions(field.options || []);
            } else {
                setName('');
                setKey('');
                setFieldType('TEXT');
                setCategoryId(null);
                setRequired(false);
                setActive(true);
                setSortOrder(0);
                setDescription('');
                setDefaultValue('');
                setOptions([]);
            }
        }
    }, [isOpen, field]);

    // Generate safe key from name if key is empty and it's a new field
    useEffect(() => {
        if (!field && name && !key) {
            const generatedKey = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
            setKey(generatedKey);
        }
    }, [name, field]);

    const handleAddOption = () => {
        setOptions([...options, 'New Option']);
    };

    const handleOptionChange = (index: number, val: string) => {
        const newOptions = [...options];
        newOptions[index] = val;
        setOptions(newOptions);
    };

    const handleRemoveOption = (index: number) => {
        setOptions(options.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        let parsedDefaultValue: any = defaultValue;
        if (defaultValue === '') {
            parsedDefaultValue = null;
        } else if (fieldType === 'NUMBER') {
            parsedDefaultValue = parseInt(defaultValue, 10);
            if (isNaN(parsedDefaultValue)) {
                error('Default value must be an integer');
                return;
            }
        } else if (fieldType === 'DECIMAL') {
            parsedDefaultValue = parseFloat(defaultValue);
            if (isNaN(parsedDefaultValue)) {
                error('Default value must be a number');
                return;
            }
        } else if (fieldType === 'BOOLEAN') {
            parsedDefaultValue = defaultValue.toLowerCase() === 'true';
        }

        const payload: any = {
            name,
            key,
            field_type: fieldType,
            category: categoryId,
            required,
            active,
            sort_order: sortOrder,
            description,
            default_value: parsedDefaultValue,
            options: ['SELECT', 'MULTI_SELECT'].includes(fieldType) ? options : null,
        };

        setIsSubmitting(true);
        try {
            if (field) {
                await updateItemFieldDefinition(field.id, payload);
                success('Field updated successfully');
            } else {
                await createItemFieldDefinition(payload);
                success('Field created successfully');
            }
            onSuccess();
            onClose();
        } catch (err: any) {
            error(err.response?.data?.detail || err.response?.data?.key?.[0] || 'Failed to save custom field');
        } finally {
            setIsSubmitting(false);
        }
    };

    const showOptions = ['SELECT', 'MULTI_SELECT'].includes(fieldType);

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={field ? "Edit Custom Field" : "New Custom Field"}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button variant="primary" onClick={handleSubmit} loading={isSubmitting}>Save Field</Button>
                </>
            }
        >
            <form onSubmit={handleSubmit} className="modal-form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <Input 
                    label="Field Label" 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    required 
                    placeholder="e.g. Warranty Period"
                />
                <Input 
                    label="Internal Name / Key" 
                    value={key} 
                    onChange={e => setKey(e.target.value)} 
                    required 
                    disabled={!!field} // Cannot change key once created to protect historical data
                    placeholder="e.g. warranty_period"
                />
                
                <div className="input-group">
                    <label>Field Type</label>
                    <select value={fieldType} onChange={e => setFieldType(e.target.value)} className="ui-input">
                        <option value="TEXT">Text</option>
                        <option value="TEXTAREA">Text Area</option>
                        <option value="NUMBER">Number (Integer)</option>
                        <option value="DECIMAL">Number (Decimal)</option>
                        <option value="BOOLEAN">Boolean (Yes/No)</option>
                        <option value="DATE">Date</option>
                        <option value="DATETIME">Date & Time</option>
                        <option value="SELECT">Dropdown (Select One)</option>
                        <option value="MULTI_SELECT">Multi-Select</option>
                    </select>
                </div>
                
                <div className="input-group">
                    <label>Applies To</label>
                    <select value={categoryId || ''} onChange={e => setCategoryId(e.target.value || null)} className="ui-input">
                        <option value="">Global (All Items)</option>
                        {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>

                <div className="input-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} />
                        Required Field
                    </label>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Must be filled when creating an item.</span>
                </div>

                <div className="input-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
                        Active
                    </label>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>If inactive, hides from forms but keeps history.</span>
                </div>

                <Input 
                    type="number"
                    label="Display Order" 
                    value={sortOrder.toString()} 
                    onChange={e => setSortOrder(parseInt(e.target.value) || 0)} 
                />
                
                <Input 
                    label="Default Value" 
                    value={defaultValue} 
                    onChange={e => setDefaultValue(e.target.value)} 
                    placeholder="Leave empty for no default"
                />
                
                <div style={{ gridColumn: '1 / -1' }}>
                    <Input 
                        label="Help Text (Optional)" 
                        value={description} 
                        onChange={e => setDescription(e.target.value)} 
                        placeholder="Description to show next to the input"
                    />
                </div>

                {showOptions && (
                    <div className="input-group" style={{ gridColumn: '1 / -1', border: '1px solid var(--color-border)', padding: '16px', borderRadius: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <label style={{ margin: 0 }}>Options List</label>
                            <Button type="button" variant="secondary" icon="bx-plus" onClick={handleAddOption}>Add Option</Button>
                        </div>
                        {options.length === 0 ? (
                            <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>No options defined.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {options.map((opt, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <Input 
                                            value={opt} 
                                            onChange={(e) => handleOptionChange(i, e.target.value)} 
                                            placeholder="Option Value"
                                        />
                                        <Button type="button" variant="ghost" icon="bx-x" onClick={() => handleRemoveOption(i)} style={{ color: 'var(--color-danger)' }} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </form>
        </Modal>
    );
};
